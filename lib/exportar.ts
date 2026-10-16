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
// Relação de Envelopes: lista de relatórios (um por linha) conforme os filtros
// ---------------------------------------------------------------------------
export interface RelatorioEnvelopeExport {
  data: string; // YYYY-MM-DD (data do relatório)
  setor: string;
  celula: string;
  lancadoPor: string;
  pix: number;
  especie: number;
  validado: boolean;
  validadoPor?: string | null;
  validadoEm?: string | null; // ISO (data_recebimento)
}

export interface DadosListaEnvelopes {
  cab: CabecalhoRelatorio;
  relatorios: RelatorioEnvelopeExport[];
}

/** Data da validação (dd/mm/aaaa), horário de Brasília; importados só com a data mantêm o dia. */
function dataValidacaoBR(valor?: string | null): string {
  if (!valor) return '';
  const d = new Date(valor);
  if (isNaN(d.getTime())) return '';
  const soData = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return d.toLocaleDateString('pt-BR', { timeZone: soData ? 'UTC' : 'America/Sao_Paulo' });
}

function ordenarRelatorios(lista: RelatorioEnvelopeExport[]) {
  return [...lista].sort(
    (a, b) =>
      String(a.data).localeCompare(String(b.data)) ||
      a.setor.localeCompare(b.setor) ||
      a.celula.localeCompare(b.celula)
  );
}

function resumoLista(lista: RelatorioEnvelopeExport[]) {
  let pix = 0;
  let especie = 0;
  let validados = 0;
  for (const r of lista) {
    pix += r.pix;
    especie += r.especie;
    if (r.validado) validados++;
  }
  return { pix, especie, total: pix + especie, validados, pendentes: lista.length - validados };
}

export async function exportarListaEnvelopesPdf({ cab, relatorios }: DadosListaEnvelopes, nomeBase?: string) {
  const { doc, autoTable } = await novoPdf('landscape');
  const lista = ordenarRelatorios(relatorios);
  const r = resumoLista(lista);
  let y = cabecalhoPdf(doc, cab);

  doc.setFontSize(9);
  doc.text(
    `Relatórios: ${lista.length}   ·   Validados: ${r.validados}   ·   Pendentes: ${r.pendentes}   ·   PIX: ${brl(r.pix)}   ·   Espécie: ${brl(r.especie)}   ·   Total: ${brl(r.total)}`,
    12,
    y
  );
  y += 4;

  const pendentes = new Set<number>();
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['Data', 'Setor', 'Célula', 'Líder(es)', 'PIX', 'Espécie', 'Total', 'Situação', 'Validado por']],
    body: lista.length
      ? lista.map((x, i) => {
          if (!x.validado) pendentes.add(i);
          const quando = dataValidacaoBR(x.validadoEm);
          return [
            dataBR(x.data),
            x.setor,
            x.celula,
            x.lancadoPor || '-',
            brl(x.pix),
            brl(x.especie),
            brl(x.pix + x.especie),
            x.validado ? 'Validado' : 'Pendente',
            x.validado ? `${x.validadoPor || 'Tesoureiro'}${quando ? ` - ${quando}` : ''}` : '-',
          ];
        })
      : [[{ content: 'Nenhum relatório nos filtros selecionados', colSpan: 9 }]],
    foot: [['', '', '', 'Totais', brl(r.pix), brl(r.especie), brl(r.total), '', '']],
    headStyles: { fillColor: COR_ESCURA, fontSize: 8 },
    footStyles: { fillColor: [235, 237, 244], textColor: [20, 20, 20], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7.5, cellPadding: 1.5, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 20 },
      4: { halign: 'right', cellWidth: 24 },
      5: { halign: 'right', cellWidth: 24 },
      6: { halign: 'right', cellWidth: 26 },
      7: { cellWidth: 20 },
    },
    margin: { left: 10, right: 10 },
    didParseCell: (d: any) => {
      if (d.section === 'body' && pendentes.has(d.row.index)) d.cell.styles.fillColor = COR_PENDENTE;
      if (d.section === 'foot' && d.column.index >= 4 && d.column.index <= 6) d.cell.styles.halign = 'right';
    },
  });

  rodapePdf(doc);
  doc.save(nomeArquivo(nomeBase || `envelopes ${cab.periodo}`, 'pdf'));
}

export async function exportarListaEnvelopesExcel({ cab, relatorios }: DadosListaEnvelopes, nomeBase?: string) {
  const wb = await novaPlanilha();
  const ws = wb.addWorksheet('Relatórios');
  const lista = ordenarRelatorios(relatorios);
  ws.columns = [
    { width: 12 },
    { width: 18 },
    { width: 30 },
    { width: 26 },
    { width: 14 },
    { width: 14 },
    { width: 15 },
    { width: 12 },
    { width: 24 },
    { width: 14 },
  ];
  let linha = cabecalhoExcel(ws, cab, 10);
  const cabTabela = ws.getRow(linha);
  cabTabela.values = ['Data', 'Setor', 'Célula', 'Líder(es)', 'PIX', 'Espécie', 'Total', 'Situação', 'Validado por', 'Validado em'];
  estiloCabecalhoTabela(cabTabela);
  const linhaCab = linha;
  linha++;
  const primeira = linha;

  for (const x of lista) {
    const row = ws.getRow(linha);
    const [a, m, d] = String(x.data || '').slice(0, 10).split('-').map(Number);
    row.getCell(1).value = a && m && d ? new Date(Date.UTC(a, m - 1, d, 12)) : null;
    row.getCell(1).numFmt = 'dd/mm/yyyy';
    row.getCell(2).value = x.setor;
    row.getCell(3).value = x.celula;
    row.getCell(4).value = x.lancadoPor || '';
    row.getCell(5).value = Math.round(x.pix * 100) / 100;
    row.getCell(6).value = Math.round(x.especie * 100) / 100;
    row.getCell(7).value = { formula: `E${linha}+F${linha}` };
    [5, 6, 7].forEach((c) => (row.getCell(c).numFmt = FORMATO_BRL_EXCEL));
    row.getCell(8).value = x.validado ? 'Validado' : 'Pendente';
    row.getCell(9).value = x.validado ? x.validadoPor || 'Tesoureiro' : '';
    row.getCell(10).value = x.validado ? dataValidacaoBR(x.validadoEm) : '';
    if (!x.validado) {
      row.eachCell({ includeEmpty: true }, (c: any) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDABAB' } };
      });
    }
    linha++;
  }

  if (lista.length) {
    const tot = ws.getRow(linha);
    tot.getCell(4).value = 'Totais';
    [5, 6, 7].forEach((c) => {
      const col = ws.getColumn(c).letter;
      tot.getCell(c).value = { formula: `SUM(${col}${primeira}:${col}${linha - 1})` };
      tot.getCell(c).numFmt = FORMATO_BRL_EXCEL;
    });
    tot.font = { bold: true };
    ws.autoFilter = { from: { row: linhaCab, column: 1 }, to: { row: linha - 1, column: 10 } };
  } else {
    ws.getRow(linha).getCell(1).value = 'Nenhum relatório nos filtros selecionados';
  }
  ws.views = [{ state: 'frozen', ySplit: linhaCab }];

  await salvarPlanilha(wb, nomeArquivo(nomeBase || `envelopes ${cab.periodo}`, 'xlsx'));
}
