/**
 * Exportação em PDF e Excel feita no navegador, com os dados que a tela já
 * carregou: exportar não faz nenhuma consulta nova ao banco.
 * As bibliotecas (jsPDF / ExcelJS) só são baixadas quando o usuário exporta.
 */
import type { FluxoCaixaItem } from './types';

export interface CabecalhoRelatorio {
  igreja: string | null;
  titulo: string;
  periodo: string;
  filtros?: string | null;
  geradoPor?: string | null;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const FORMATO_BRL_EXCEL = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const COR_ESCURA: [number, number, number] = [28, 32, 48];
const COR_PENDENTE: [number, number, number] = [237, 171, 171];

function agoraBR(): string {
  return new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function dataBR(iso: string): string {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : '-';
}

function ehEntrada(item: FluxoCaixaItem): boolean {
  return String(item.TipoFluxo || '').toLowerCase().includes('entrada');
}

function nomeArquivo(base: string, ext: string): string {
  const limpo = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${limpo || 'relatorio'}.${ext}`;
}

function baixar(blob: Blob, arquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = arquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function novoPdf(orientacao: 'portrait' | 'landscape') {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: orientacao, unit: 'mm', format: 'a4' });
  const autoTable = autoTableMod.default;
  return { doc, autoTable };
}

/** Cabeçalho padrão; devolve a altura (mm) onde o conteúdo começa. */
function cabecalhoPdf(doc: any, cab: CabecalhoRelatorio): number {
  const larg = doc.internal.pageSize.getWidth();
  doc.setFillColor(...COR_ESCURA);
  doc.rect(0, 0, larg, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(cab.titulo, 12, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(cab.igreja || 'Tesouraria', 12, 16);
  doc.text(`Período: ${cab.periodo}`, 12, 21);
  doc.text(`Gerado em ${agoraBR()}${cab.geradoPor ? ` por ${cab.geradoPor}` : ''}`, larg - 12, 21, { align: 'right' });
  doc.setTextColor(30, 30, 30);
  let y = 31;
  if (cab.filtros) {
    doc.setFontSize(8.5);
    doc.setTextColor(90, 90, 90);
    doc.text(`Filtros: ${cab.filtros}`, 12, y);
    doc.setTextColor(30, 30, 30);
    y += 6;
  }
  return y;
}

function rodapePdf(doc: any) {
  const total = doc.getNumberOfPages();
  const larg = doc.internal.pageSize.getWidth();
  const alt = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text('ADM Tesouraria · AppChurch', 12, alt - 6);
    doc.text(`Página ${i} de ${total}`, larg - 12, alt - 6, { align: 'right' });
  }
}

async function novaPlanilha() {
  const mod: any = await import('exceljs');
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ADM Tesouraria AppChurch';
  wb.created = new Date();
  return wb;
}

/** Linhas de título no topo da aba; devolve a próxima linha livre. */
function cabecalhoExcel(ws: any, cab: CabecalhoRelatorio, colunas: number): number {
  const linhas = [
    cab.titulo,
    cab.igreja || 'Tesouraria',
    `Período: ${cab.periodo}`,
    ...(cab.filtros ? [`Filtros: ${cab.filtros}`] : []),
    `Gerado em ${agoraBR()}${cab.geradoPor ? ` por ${cab.geradoPor}` : ''}`,
  ];
  linhas.forEach((texto, i) => {
    const r = ws.getRow(i + 1);
    r.getCell(1).value = texto;
    r.getCell(1).font = i === 0 ? { bold: true, size: 14 } : { size: 10, color: { argb: 'FF555555' } };
    ws.mergeCells(i + 1, 1, i + 1, Math.max(colunas, 1));
  });
  return linhas.length + 2;
}

function estiloCabecalhoTabela(row: any) {
  row.eachCell((c: any) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C2030' } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
}

async function salvarPlanilha(wb: any, arquivo: string) {
  const buf = await wb.xlsx.writeBuffer();
  baixar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), arquivo);
}

// ---------------------------------------------------------------------------
// Balancete do Fluxo de Caixa
// ---------------------------------------------------------------------------
export interface DadosBalancete {
  cab: CabecalhoRelatorio;
  itens: FluxoCaixaItem[];
  /** Saldo de todo o histórico da igreja (indicador da tela) */
  saldoGeral: number;
}

function resumirBalancete(itens: FluxoCaixaItem[]) {
  let entradas = 0;
  let saidas = 0;
  const porCategoria = new Map<string, { tipo: 'Entrada' | 'Saída'; qtd: number; total: number }>();
  for (const it of itens) {
    const entrada = ehEntrada(it);
    const v = Number(it.ValorFluxo || 0);
    if (entrada) entradas += v;
    else saidas += v;
    const tipo = entrada ? 'Entrada' : 'Saída';
    const chave = `${tipo}|${it.CategoriaFluxo || 'Sem categoria'}`;
    const atual = porCategoria.get(chave) || { tipo, qtd: 0, total: 0 };
    atual.qtd += 1;
    atual.total += v;
    porCategoria.set(chave, atual);
  }
  const categorias = Array.from(porCategoria.entries())
    .map(([chave, v]) => ({ categoria: chave.split('|').slice(1).join('|'), ...v }))
    .sort((a, b) => (a.tipo === b.tipo ? b.total - a.total : a.tipo === 'Entrada' ? -1 : 1));
  const ordenados = [...itens].sort((a, b) => String(a.DataFluxo).localeCompare(String(b.DataFluxo)));
  return { entradas, saidas, resultado: entradas - saidas, categorias, ordenados };
}

export async function exportarBalancetePdf({ cab, itens, saldoGeral }: DadosBalancete) {
  const { doc, autoTable } = await novoPdf('portrait');
  const r = resumirBalancete(itens);
  let y = cabecalhoPdf(doc, cab);

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['Resumo do período', 'Valor']],
    body: [
      ['Total de entradas', brl(r.entradas)],
      ['Total de saídas', brl(r.saidas)],
      ['Resultado do período', brl(r.resultado)],
      ['Saldo geral acumulado (todo o histórico)', brl(saldoGeral)],
    ],
    headStyles: { fillColor: COR_ESCURA },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    styles: { fontSize: 9 },
    margin: { left: 12, right: 12 },
  });
  y = (doc as any).lastAutoTable.finalY + 7;

  autoTable(doc, {
    startY: y,
    theme: 'striped',
    head: [['Tipo', 'Categoria', 'Lançamentos', 'Total']],
    body: r.categorias.length
      ? r.categorias.map((c) => [c.tipo, c.categoria, String(c.qtd), brl(c.total)])
      : [['-', 'Nenhum lançamento no período', '-', '-']],
    headStyles: { fillColor: COR_ESCURA },
    columnStyles: { 2: { halign: 'center' }, 3: { halign: 'right' } },
    styles: { fontSize: 8.5 },
    margin: { left: 12, right: 12 },
    didParseCell: (d: any) => {
      if (d.section === 'body' && d.column.index === 0) {
        d.cell.styles.textColor = d.cell.raw === 'Entrada' ? [5, 120, 85] : [190, 18, 60];
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 7;

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['Data', 'Tipo', 'Categoria', 'Observações', 'Status', 'Comprov.', 'Valor']],
    body: r.ordenados.map((it) => [
      dataBR(it.DataFluxo),
      ehEntrada(it) ? 'Entrada' : 'Saída',
      it.CategoriaFluxo || '-',
      it.ObservacoesFluxo || '',
      it.StatusFluxo || 'CONFIRMADO',
      it.temComprovante ? 'Sim' : '-',
      `${ehEntrada(it) ? '' : '- '}${brl(Number(it.ValorFluxo || 0))}`,
    ]),
    foot: [['', '', '', '', '', 'Resultado', brl(r.resultado)]],
    headStyles: { fillColor: COR_ESCURA },
    footStyles: { fillColor: [235, 237, 244], textColor: [20, 20, 20], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 19 }, 1: { cellWidth: 15 }, 4: { cellWidth: 22 }, 5: { cellWidth: 16, halign: 'center' }, 6: { halign: 'right', cellWidth: 28 } },
    styles: { fontSize: 7.5, overflow: 'linebreak' },
    margin: { left: 12, right: 12 },
  });

  rodapePdf(doc);
  doc.save(nomeArquivo(`balancete ${cab.periodo}`, 'pdf'));
}

export async function exportarBalanceteExcel({ cab, itens, saldoGeral }: DadosBalancete) {
  const wb = await novaPlanilha();
  const r = resumirBalancete(itens);

  // Aba 1: resumo + por categoria
  const ws = wb.addWorksheet('Balancete');
  ws.columns = [{ width: 14 }, { width: 38 }, { width: 14 }, { width: 18 }];
  let linha = cabecalhoExcel(ws, cab, 4);
  const resumo: Array<[string, number]> = [
    ['Total de entradas', r.entradas],
    ['Total de saídas', r.saidas],
    ['Resultado do período', r.resultado],
    ['Saldo geral acumulado (todo o histórico)', saldoGeral],
  ];
  for (const [rotulo, valor] of resumo) {
    const row = ws.getRow(linha++);
    row.getCell(1).value = rotulo;
    ws.mergeCells(row.number, 1, row.number, 3);
    row.getCell(4).value = Math.round(valor * 100) / 100;
    row.getCell(4).numFmt = FORMATO_BRL_EXCEL;
    row.getCell(4).font = { bold: true };
  }
  linha += 1;
  const cabCat = ws.getRow(linha++);
  cabCat.values = ['Tipo', 'Categoria', 'Lançamentos', 'Total'];
  estiloCabecalhoTabela(cabCat);
  for (const c of r.categorias) {
    const row = ws.getRow(linha++);
    row.values = [c.tipo, c.categoria, c.qtd, Math.round(c.total * 100) / 100];
    row.getCell(4).numFmt = FORMATO_BRL_EXCEL;
    row.getCell(1).font = { color: { argb: c.tipo === 'Entrada' ? 'FF057855' : 'FFBE123C' }, bold: true };
  }

  // Aba 2: lançamentos (valores numéricos, prontos para somar/filtrar)
  const wl = wb.addWorksheet('Lançamentos');
  wl.columns = [
    { header: 'Data', key: 'data', width: 12 },
    { header: 'Tipo', key: 'tipo', width: 10 },
    { header: 'Categoria', key: 'categoria', width: 30 },
    { header: 'Observações', key: 'obs', width: 44 },
    { header: 'Status', key: 'status', width: 13 },
    { header: 'Tesoureiro', key: 'tes', width: 22 },
    { header: 'Comprovante', key: 'comp', width: 13 },
    { header: 'Valor', key: 'valor', width: 16 },
  ];
  estiloCabecalhoTabela(wl.getRow(1));
  for (const it of r.ordenados) {
    const [a, m, d] = String(it.DataFluxo || '').slice(0, 10).split('-').map(Number);
    const v = Number(it.ValorFluxo || 0);
    const row = wl.addRow({
      data: a && m && d ? new Date(Date.UTC(a, m - 1, d, 12)) : null,
      tipo: ehEntrada(it) ? 'Entrada' : 'Saída',
      categoria: it.CategoriaFluxo || '',
      obs: it.ObservacoesFluxo || '',
      status: it.StatusFluxo || 'CONFIRMADO',
      tes: it.nome_tesoureiro || '',
      comp: it.temComprovante ? 'Sim' : 'Não',
      // Saída negativa: a soma da coluna é o resultado
      valor: Math.round((ehEntrada(it) ? v : -v) * 100) / 100,
    });
    row.getCell('data').numFmt = 'dd/mm/yyyy';
    row.getCell('valor').numFmt = FORMATO_BRL_EXCEL;
  }
  if (r.ordenados.length) {
    const total = wl.addRow({ obs: 'Resultado', valor: { formula: `SUM(H2:H${r.ordenados.length + 1})` } });
    total.font = { bold: true };
    total.getCell('valor').numFmt = FORMATO_BRL_EXCEL;
  }
  wl.autoFilter = { from: 'A1', to: 'H1' };
  wl.views = [{ state: 'frozen', ySplit: 1 }];

  await salvarPlanilha(wb, nomeArquivo(`balancete ${cab.periodo}`, 'xlsx'));
}

// ---------------------------------------------------------------------------
// Relação de Envelopes (células x semanas)
// ---------------------------------------------------------------------------
export interface SemanaExport {
  num: number;
  data: string; // dd/mm/aaaa
}

export interface ValorSemanaExport {
  temDado: boolean;
  validado: boolean;
  pix: number;
  especie: number;
  /** Há relatório, mas ficou de fora pelo filtro de situação (validados/pendentes) */
  filtrado?: boolean;
}

export interface LinhaEnvelopeExport {
  setor: string;
  celula: string;
  lider: string;
  semanas: ValorSemanaExport[];
}

/** Uma grade (um mês). Vários meses = várias grades no mesmo arquivo. */
export interface DadosEnvelopes {
  cab: CabecalhoRelatorio;
  semanas: SemanaExport[];
  linhas: LinhaEnvelopeExport[];
  /** Nome da aba no Excel (ex.: "Abril 2026") */
  nomeAba?: string;
}

function totaisEnvelopes(linhas: LinhaEnvelopeExport[], qtdSemanas: number) {
  const porSemana = Array.from({ length: qtdSemanas }, () => ({ pix: 0, especie: 0 }));
  let pix = 0;
  let especie = 0;
  let pendentes = 0;
  let validados = 0;
  let semRelatorio = 0;
  for (const l of linhas) {
    l.semanas.forEach((s, i) => {
      if (s.filtrado) return;
      if (!s.temDado) {
        semRelatorio++;
        return;
      }
      if (s.validado) validados++;
      else pendentes++;
      porSemana[i].pix += s.pix;
      porSemana[i].especie += s.especie;
      pix += s.pix;
      especie += s.especie;
    });
  }
  return { porSemana, pix, especie, total: pix + especie, pendentes, validados, semRelatorio };
}

function desenharEnvelopesPdf(doc: any, autoTable: any, { cab, semanas, linhas }: DadosEnvelopes) {
  const t = totaisEnvelopes(linhas, semanas.length);
  let y = cabecalhoPdf(doc, cab);

  doc.setFontSize(9);
  doc.text(
    `Total PIX: ${brl(t.pix)}   ·   Total espécie: ${brl(t.especie)}   ·   Total geral: ${brl(t.total)}   ·   Validados: ${t.validados}   ·   Pendentes: ${t.pendentes}`,
    12,
    y
  );
  y += 4;

  const head = [
    [
      { content: 'Célula / Líder', rowSpan: 2 },
      ...semanas.map((s) => ({ content: `Sem. ${s.num} · ${s.data}`, colSpan: 2 })),
      { content: 'Total da célula', rowSpan: 2 },
    ],
    semanas.flatMap(() => ['PIX', 'Espécie']),
  ];

  const pendentesMarcados = new Set<string>();
  const body = linhas.map((l, li) => {
    let totalCel = 0;
    const celulas = l.semanas.flatMap((s, si) => {
      if (!s.temDado || s.filtrado) return ['-', '-'];
      totalCel += s.pix + s.especie;
      if (!s.validado) {
        pendentesMarcados.add(`${li}:${1 + si * 2}`);
        pendentesMarcados.add(`${li}:${2 + si * 2}`);
      }
      return [brl(s.pix), brl(s.especie)];
    });
    return [`${l.celula}${l.setor ? ` (${l.setor})` : ''}\nLíder: ${l.lider || '-'}`, ...celulas, brl(totalCel)];
  });

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head,
    body: body.length ? body : [[{ content: 'Nenhuma célula no filtro selecionado', colSpan: 2 + semanas.length * 2 }]],
    foot: [['Totais da semana', ...t.porSemana.flatMap((s) => [brl(s.pix), brl(s.especie)]), brl(t.total)]],
    headStyles: { fillColor: COR_ESCURA, halign: 'center', fontSize: 7.5 },
    footStyles: { fillColor: [235, 237, 244], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'right', fontSize: 7.5 },
    styles: { fontSize: 7, cellPadding: 1.4 },
    columnStyles: { 0: { cellWidth: 52, halign: 'left' } },
    margin: { left: 8, right: 8 },
    didParseCell: (d: any) => {
      if (d.section === 'body' && d.column.index > 0) {
        d.cell.styles.halign = 'right';
        if (pendentesMarcados.has(`${d.row.index}:${d.column.index}`)) d.cell.styles.fillColor = COR_PENDENTE;
      }
      if (d.section === 'foot' && d.column.index === 0) d.cell.styles.halign = 'left';
    },
  });
  y = (doc as any).lastAutoTable.finalY + 5;
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  doc.text('Em vermelho: relatório lançado e ainda não validado pela tesouraria. "-": sem relatório (ou fora do filtro).', 8, y);
  doc.setTextColor(30, 30, 30);
}

/** PDF com uma ou mais grades (um mês por página). */
export async function exportarEnvelopesPdf(dados: DadosEnvelopes | DadosEnvelopes[], nomeBase?: string) {
  const grades = Array.isArray(dados) ? dados : [dados];
  const { doc, autoTable } = await novoPdf('landscape');
  grades.forEach((g, i) => {
    if (i > 0) doc.addPage();
    desenharEnvelopesPdf(doc, autoTable, g);
  });
  rodapePdf(doc);
  doc.save(nomeArquivo(nomeBase || `envelopes ${grades[0]?.cab.periodo || ''}`, 'pdf'));
}

function planilhaEnvelopes(wb: any, { cab, semanas, linhas }: DadosEnvelopes, nomeAba: string) {
  const ws = wb.addWorksheet(nomeAba);
  const qtdColunas = 3 + semanas.length * 3 + 3;
  ws.columns = [
    { width: 16 },
    { width: 30 },
    { width: 26 },
    ...semanas.flatMap(() => [{ width: 13 }, { width: 13 }, { width: 11 }]),
    { width: 15 },
    { width: 15 },
    { width: 16 },
  ];
  let linha = cabecalhoExcel(ws, cab, Math.min(qtdColunas, 10));

  // Duas linhas de cabeçalho: semana (mesclada) e PIX/Espécie/Situação
  const h1 = ws.getRow(linha);
  const h2 = ws.getRow(linha + 1);
  ['Setor', 'Célula', 'Líder'].forEach((t, i) => {
    h1.getCell(i + 1).value = t;
    ws.mergeCells(linha, i + 1, linha + 1, i + 1);
  });
  semanas.forEach((s, i) => {
    const col = 4 + i * 3;
    h1.getCell(col).value = `Semana ${s.num} · ${s.data}`;
    ws.mergeCells(linha, col, linha, col + 2);
    h2.getCell(col).value = 'PIX';
    h2.getCell(col + 1).value = 'Espécie';
    h2.getCell(col + 2).value = 'Situação';
  });
  const colTot = 4 + semanas.length * 3;
  ['Total PIX', 'Total espécie', 'Total da célula'].forEach((t, i) => {
    h1.getCell(colTot + i).value = t;
    ws.mergeCells(linha, colTot + i, linha + 1, colTot + i);
  });
  estiloCabecalhoTabela(h1);
  estiloCabecalhoTabela(h2);
  linha += 2;
  const primeiraLinhaDados = linha;

  for (const l of linhas) {
    const row = ws.getRow(linha);
    row.getCell(1).value = l.setor;
    row.getCell(2).value = l.celula;
    row.getCell(3).value = l.lider;
    l.semanas.forEach((s, i) => {
      const col = 4 + i * 3;
      const cPix = row.getCell(col);
      const cEsp = row.getCell(col + 1);
      const cSit = row.getCell(col + 2);
      if (s.temDado && !s.filtrado) {
        cPix.value = Math.round(s.pix * 100) / 100;
        cEsp.value = Math.round(s.especie * 100) / 100;
        cSit.value = s.validado ? 'Validado' : 'Pendente';
        if (!s.validado) {
          [cPix, cEsp, cSit].forEach((c: any) => {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDABAB' } };
          });
        }
      } else {
        cSit.value = s.filtrado ? '-' : 'Sem relatório';
        cSit.font = { color: { argb: 'FF888888' } };
      }
      cPix.numFmt = FORMATO_BRL_EXCEL;
      cEsp.numFmt = FORMATO_BRL_EXCEL;
    });
    // Totais por fórmula: quem editar um valor na planilha vê o total atualizar
    const letra = (c: number) => ws.getColumn(c).letter;
    const colsPix = semanas.map((_, i) => `${letra(4 + i * 3)}${linha}`).join(',');
    const colsEsp = semanas.map((_, i) => `${letra(5 + i * 3)}${linha}`).join(',');
    row.getCell(colTot).value = { formula: `SUM(${colsPix || '0'})` };
    row.getCell(colTot + 1).value = { formula: `SUM(${colsEsp || '0'})` };
    row.getCell(colTot + 2).value = { formula: `${letra(colTot)}${linha}+${letra(colTot + 1)}${linha}` };
    [colTot, colTot + 1, colTot + 2].forEach((c) => (row.getCell(c).numFmt = FORMATO_BRL_EXCEL));
    row.getCell(colTot + 2).font = { bold: true };
    linha++;
  }

  if (linhas.length) {
    const tot = ws.getRow(linha);
    tot.getCell(2).value = 'Totais';
    const ultima = linha - 1;
    const somaCol = (c: number) => ({ formula: `SUM(${ws.getColumn(c).letter}${primeiraLinhaDados}:${ws.getColumn(c).letter}${ultima})` });
    semanas.forEach((_, i) => {
      tot.getCell(4 + i * 3).value = somaCol(4 + i * 3);
      tot.getCell(5 + i * 3).value = somaCol(5 + i * 3);
      tot.getCell(4 + i * 3).numFmt = FORMATO_BRL_EXCEL;
      tot.getCell(5 + i * 3).numFmt = FORMATO_BRL_EXCEL;
    });
    [colTot, colTot + 1, colTot + 2].forEach((c) => {
      tot.getCell(c).value = somaCol(c);
      tot.getCell(c).numFmt = FORMATO_BRL_EXCEL;
    });
    tot.font = { bold: true };
    tot.eachCell((c: any) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBEDF4' } };
    });
  } else {
    ws.getRow(linha).getCell(2).value = 'Nenhuma célula no filtro selecionado';
  }
  ws.views = [{ state: 'frozen', xSplit: 3, ySplit: primeiraLinhaDados - 1 }];
}

/** Excel com uma ou mais grades (uma aba por mês). */
export async function exportarEnvelopesExcel(dados: DadosEnvelopes | DadosEnvelopes[], nomeBase?: string) {
  const grades = Array.isArray(dados) ? dados : [dados];
  const wb = await novaPlanilha();
  const usados = new Set<string>();
  grades.forEach((g, i) => {
    // Nome de aba: até 31 caracteres, sem : \ / ? * [ ] e sem repetir
    let nome = (g.nomeAba || g.cab.periodo || `Mês ${i + 1}`).replace(/[:\\/?*[\]]/g, '-').slice(0, 31) || `Mês ${i + 1}`;
    let n = 2;
    while (usados.has(nome)) nome = `${nome.slice(0, 27)} (${n++})`;
    usados.add(nome);
    planilhaEnvelopes(wb, g, nome);
  });
  await salvarPlanilha(wb, nomeArquivo(nomeBase || `envelopes ${grades[0]?.cab.periodo || ''}`, 'xlsx'));
}
