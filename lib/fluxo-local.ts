/**
 * Atualização local do Fluxo de Caixa depois de incluir, editar ou excluir.
 *
 * Em vez de reler a lista e o histórico inteiro do banco, a tela troca só a
 * linha afetada e ajusta os indicadores somando/subtraindo o valor.
 * As regras abaixo são as mesmas das ações fluxo_listar e fluxo_kpis da API
 * (app/api/treasury/route.ts): se mudar lá, mude aqui também.
 */
import type { FluxoCaixaItem, FluxoCaixaKPIs, FluxoMensalDemonstrativo } from './types';

export interface EstadoFluxo {
  lista: FluxoCaixaItem[];
  kpis: FluxoCaixaKPIs;
  demonstrativo: FluxoMensalDemonstrativo[];
  anosDisponiveis: number[];
}

const arred = (v: number) => Math.round(v * 100) / 100;

function ehTodos(v: number | string): boolean {
  const s = String(v ?? '').toLowerCase();
  return !s || s === 'todos' || s === 'todos os anos' || s === 'todos os meses';
}

/** Ano usado no demonstrativo/indicadores (o servidor usa o ano atual quando é "todos"). */
function anoBase(ano: number | string): number {
  const n = Number(ano);
  return !ehTodos(ano) && n > 2000 ? n : new Date().getFullYear();
}

function mesNumero(mes: number | string): number | null {
  const n = Number(mes);
  return !ehTodos(mes) && n >= 1 && n <= 12 ? n : null;
}

function partesData(item: FluxoCaixaItem): { ano: number; mes: number } {
  const d = String(item.DataFluxo || '').slice(0, 10);
  return { ano: Number(d.slice(0, 4)), mes: Number(d.slice(5, 7)) };
}

function ehEntrada(item: FluxoCaixaItem): boolean {
  return String(item.TipoFluxo || '').toLowerCase().includes('entrada');
}

/** O lançamento aparece na lista do período? (mesmo filtro da ação fluxo_listar) */
function pertenceALista(item: FluxoCaixaItem, ano: number | string, mes: number | string): boolean {
  const p = partesData(item);
  if (!ehTodos(ano) && !isNaN(Number(ano)) && p.ano !== Number(ano)) return false;
  const m = mesNumero(mes);
  if (m !== null) {
    if (p.ano !== anoBase(ano) || p.mes !== m) return false;
  }
  return true;
}

/** Mesma ordem do servidor: data desc, criação desc, ID asc. */
function ordenar(lista: FluxoCaixaItem[]): FluxoCaixaItem[] {
  return [...lista].sort((a, b) => {
    const d = String(b.DataFluxo).localeCompare(String(a.DataFluxo));
    if (d !== 0) return d;
    const c = String(b.criado_em || '').localeCompare(String(a.criado_em || ''));
    if (c !== 0) return c;
    return String(a.ID).localeCompare(String(b.ID));
  });
}

/**
 * Aplica uma mudança: `antes` = versão anterior (null em inclusão),
 * `depois` = versão nova (null em exclusão).
 */
export function aplicarMudancaFluxo(
  estado: EstadoFluxo,
  antes: FluxoCaixaItem | null,
  depois: FluxoCaixaItem | null,
  ano: number | string,
  mes: number | string
): EstadoFluxo {
  const anoNum = anoBase(ano);
  const mesNum = mesNumero(mes);
  const todosAnos = ehTodos(ano);

  // Indicadores guardados como somas para poder subtrair/somar
  let entradasGeral = 0;
  let saidasGeral = 0;
  // saldoAtual = entradasGeral - saidasGeral; ajusta pela diferença
  let saldoAtual = estado.kpis.saldoAtual;
  let entradasPeriodo = estado.kpis.entradasMes;
  let saidasPeriodo = estado.kpis.saidasMes;
  let anoCompletoEntradas = estado.kpis.anoCompletoEntradas;
  const demonstrativo = estado.demonstrativo.map((d) => ({ ...d }));
  const anos = new Set(estado.anosDisponiveis);

  const aplicar = (item: FluxoCaixaItem, sinal: 1 | -1) => {
    const v = Number(item.ValorFluxo || 0) * sinal;
    const entrada = ehEntrada(item);
    const p = partesData(item);
    if (entrada) entradasGeral += v;
    else saidasGeral += v;
    if (sinal === 1 && p.ano > 2000) anos.add(p.ano);

    if (p.ano === anoNum && p.mes >= 1 && p.mes <= 12) {
      const d = demonstrativo.find((x) => x.mesNumero === p.mes);
      if (d) {
        if (entrada) d.entradas = arred(d.entradas + v);
        else d.saidas = arred(d.saidas + v);
        d.resultado = arred(d.entradas - d.saidas);
      }
      if (entrada) anoCompletoEntradas += v;
    }

    const noAno = todosAnos ? true : p.ano === anoNum;
    const noMes = mesNum === null ? true : p.mes === mesNum;
    if (noAno && noMes) {
      if (entrada) entradasPeriodo += v;
      else saidasPeriodo += v;
    }
  };

  if (antes) aplicar(antes, -1);
  if (depois) aplicar(depois, 1);
  saldoAtual = arred(saldoAtual + entradasGeral - saidasGeral);
  entradasPeriodo = arred(entradasPeriodo);
  saidasPeriodo = arred(saidasPeriodo);
  const saldoMes = arred(entradasPeriodo - saidasPeriodo);

  const idAntes = antes ? String(antes.ID || antes.id) : null;
  let lista = idAntes ? estado.lista.filter((i) => String(i.ID || i.id) !== idAntes) : [...estado.lista];
  if (depois && pertenceALista(depois, ano, mes)) lista = ordenar([...lista, depois]);

  return {
    lista,
    demonstrativo,
    anosDisponiveis: Array.from(anos).sort((a, b) => b - a),
    kpis: {
      saldoAtual,
      entradasMes: entradasPeriodo,
      saidasMes: saidasPeriodo,
      saldoMes,
      situacao: saldoAtual >= 0 ? 'SUPERÁVIT ACUMULADO' : 'DÉFICIT ACUMULADO',
      anoCompletoEntradas: arred(anoCompletoEntradas),
      comprometimento: entradasPeriodo > 0 ? Math.round((saidasPeriodo / entradasPeriodo) * 100) : 0,
      resultadoLiquido: saldoMes >= 0 ? 'POSITIVO' : 'NEGATIVO',
    },
  };
}

/** Só troca a marcação de comprovante de uma linha (nada muda nos valores). */
export function marcarComprovante(estado: EstadoFluxo, id: string, temComprovante: boolean): EstadoFluxo {
  return {
    ...estado,
    lista: estado.lista.map((i) => (String(i.ID || i.id) === id ? { ...i, temComprovante } : i)),
  };
}
