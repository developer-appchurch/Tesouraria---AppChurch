/**
 * Grade da Relação de Envelopes (células x 5 semanas do mês), calculada a partir
 * dos lançamentos e unidades já carregados. Usada pela tela e pela exportação,
 * para que o arquivo exportado seja sempre igual ao que a tela mostra.
 */
import type { LancamentoTesouraria, UnidadeCadastrada } from './types';
import { SEM_SETOR } from './treasury-service';

export interface SemanaEnvelope {
  num: number;
  data: string; // dd/mm/aaaa (sábado que fecha a semana)
  dataIso: string;
  dataObj: Date;
}

export interface CelulaEnvelope {
  id: string;
  nome: string;
  lider: string;
  lideres: string[];
  setor: string;
  ativo: boolean;
}

export interface ValorEnvelope {
  temDado: boolean;
  pix: number | null;
  dinheiro: number | null;
  total: number;
  validadoTesouraria: boolean;
}

interface Acumulado {
  pix: number;
  dinheiro: number;
  total: number;
  validadoTesouraria: boolean;
  relatorios: LancamentoTesouraria[];
}

export function ehTodosSetores(setor?: string | null): boolean {
  const s = (setor || '').trim().toLowerCase();
  return !s || s === 'todos' || s === 'todos os setores';
}

/** Número da semana ISO. */
function semanaIso(d: Date): number {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.getTime()) / 604800000);
}

/** 5 semanas do mês, terminando no último sábado do mês. */
export function semanasDoMes(ano: number, mes: number): SemanaEnvelope[] {
  const ultimoDiaDoMes = new Date(ano, mes, 0);
  const diasParaSubtrair = (ultimoDiaDoMes.getDay() - 6 + 7) % 7;
  const dataUltimoSabado = new Date(ano, mes - 1, ultimoDiaDoMes.getDate() - diasParaSubtrair);
  const lista: SemanaEnvelope[] = [];
  for (let step = 4; step >= 0; step--) {
    const d = new Date(dataUltimoSabado);
    d.setDate(d.getDate() - step * 7);
    const diaStr = String(d.getDate()).padStart(2, '0');
    const mesStr = String(d.getMonth() + 1).padStart(2, '0');
    const anoStr = String(d.getFullYear());
    lista.push({ num: semanaIso(d), data: `${diaStr}/${mesStr}/${anoStr}`, dataIso: `${anoStr}-${mesStr}-${diaStr}`, dataObj: d });
  }
  return lista;
}

/** Células ativas do setor (ou de todos os setores), com setor e líder. */
export function celulasDoSetor(
  unidades: UnidadeCadastrada[],
  lancamentos: LancamentoTesouraria[],
  setorSelecionado: string
): CelulaEnvelope[] {
  const todos = ehTodosSetores(setorSelecionado);
  const setorAlvo = (setorSelecionado || '').trim().toLowerCase();
  const mapaSetoresPorId = new Map<string, string>();
  unidades.forEach((u) => mapaSetoresPorId.set(u.id, u.nome));
  const setorUnit = unidades.find((u) => u.nome.trim().toLowerCase() === setorAlvo);

  let filtradas: UnidadeCadastrada[];
  if (todos) {
    filtradas = unidades.filter((u) => Boolean(u.pai_id) && u.ativo === true);
  } else if (setorUnit) {
    filtradas = unidades.filter((u) => u.pai_id === setorUnit.id && u.ativo === true);
  } else {
    filtradas = unidades.filter((u) => {
      if (!u.pai_id || u.ativo !== true) return false;
      const nomePai = mapaSetoresPorId.get(u.pai_id);
      return Boolean(nomePai && nomePai.trim().toLowerCase() === setorAlvo);
    });
  }

  // Líderes informados nos lançamentos (quando o cadastro não tem)
  const lideresPorUnidade = new Map<string, string>();
  const lideresPorNome = new Map<string, string>();
  lancamentos.forEach((l) => {
    const lid = l.LiderCelula || l.liderCelula;
    if (lid && lid !== '-') {
      if (l.unidade_id) lideresPorUnidade.set(l.unidade_id, lid);
      const cNome = (l.Célula || l.celulaNome || '').trim().toLowerCase();
      if (cNome) lideresPorNome.set(cNome, lid);
    }
  });

  return filtradas
    .map((u) => {
      const setorNome = (u.pai_id && mapaSetoresPorId.get(u.pai_id)) || setorUnit?.nome || setorSelecionado || SEM_SETOR;
      const lider =
        u.lider_nome ||
        (u.lideres && u.lideres.length > 0 ? u.lideres.join(', ') : null) ||
        lideresPorUnidade.get(u.id) ||
        lideresPorNome.get(u.nome.trim().toLowerCase()) ||
        '-';
      return { id: u.id, nome: u.nome, lider, lideres: u.lideres || [], setor: setorNome, ativo: u.ativo };
    })
    .sort((a, b) => {
      if (todos) {
        const cmp = a.setor.localeCompare(b.setor);
        if (cmp !== 0) return cmp;
      }
      return a.nome.localeCompare(b.nome);
    });
}

/** A data (YYYY-MM-DD) cai na semana de domingo a sábado que termina em `sabado`? */
function dataNaSemana(dateIso: string, sabado: Date): boolean {
  if (!dateIso) return false;
  const clean = dateIso.includes('T') ? dateIso.split('T')[0] : dateIso;
  const parts = clean.split('-');
  if (parts.length !== 3) return false;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
  if (isNaN(d.getTime())) return false;
  const fim = new Date(sabado.getFullYear(), sabado.getMonth(), sabado.getDate(), 23, 59, 59);
  const inicio = new Date(sabado.getFullYear(), sabado.getMonth(), sabado.getDate() - 6, 0, 0, 0);
  return d >= inicio && d <= fim;
}

/** Índice (célula, semana) -> valores somados dos relatórios. */
export function indexarLancamentos(
  lancamentos: LancamentoTesouraria[],
  semanas: SemanaEnvelope[],
  opcoes: { ano: number | null; mes: number | null; setor: string }
): Map<string, Acumulado> {
  const map = new Map<string, Acumulado>();
  const todos = ehTodosSetores(opcoes.setor);
  const setorAlvo = (opcoes.setor || '').trim().toLowerCase();

  for (const l of lancamentos) {
    const celNome = (l.Célula || l.celulaNome || '').trim().toLowerCase();
    if (!celNome) continue;
    const setorNome = (l.Setor || l.setor || '').trim().toLowerCase() || SEM_SETOR.toLowerCase();
    if (!todos && setorNome !== setorAlvo) continue;

    const lAno = l.ano || (l.data ? new Date(l.data).getFullYear() : null);
    if (opcoes.ano !== null && lAno && lAno !== opcoes.ano) continue;

    const semNumLanc = typeof l.semanaNumero === 'number' ? l.semanaNumero : l.NumSemana;
    const lMes = l.mes || (l.data ? new Date(l.data).getMonth() + 1 : null);
    if (opcoes.mes !== null && lMes && lMes !== opcoes.mes) {
      // Mês diferente, mas a semana pode cair na grade do mês escolhido
      const naGrade = semanas.some((s) => s.num === semNumLanc || (l.data && dataNaSemana(l.data, s.dataObj)));
      if (!naGrade) continue;
    }

    let semana: SemanaEnvelope | undefined;
    for (const sem of semanas) {
      if (typeof semNumLanc === 'number' && semNumLanc === sem.num) {
        semana = sem;
        break;
      }
      if (l.dataBR === sem.data || l.data === sem.dataIso) {
        semana = sem;
        break;
      }
      if (l.data && dataNaSemana(l.data, sem.dataObj)) {
        semana = sem;
        break;
      }
    }
    if (!semana) continue;

    const pix = Number(l.valorPix ?? (l.ValorOferta ?? 0));
    const esp = Number(l.valorEspecie ?? (l.OfertaEspecie ?? 0));
    const tot = Number(l.valorTotal ?? (l.Total ?? pix + esp));
    const validado = l.TESOURARIA_RECEB === true;

    const chaves = [`${celNome}___sem_${semana.num}`, `${setorNome}___${celNome}___sem_${semana.num}`];
    if (l.unidade_id) chaves.push(`u_${l.unidade_id}___sem_${semana.num}`);
    for (const k of chaves) {
      const atual = map.get(k);
      if (atual) {
        atual.pix += pix;
        atual.dinheiro += esp;
        atual.total += tot;
        atual.validadoTesouraria = atual.validadoTesouraria && validado;
        atual.relatorios.push(l);
      } else {
        map.set(k, { pix, dinheiro: esp, total: tot, validadoTesouraria: validado, relatorios: [l] });
      }
    }
  }
  return map;
}

export function valoresDaCelula(
  indice: Map<string, Acumulado>,
  celula: { id: string; nome: string; setor: string },
  semana: { num: number }
): ValorEnvelope {
  const cNorm = celula.nome.trim().toLowerCase();
  const sNorm = (celula.setor || '').trim().toLowerCase();
  const data =
    (celula.id ? indice.get(`u_${celula.id}___sem_${semana.num}`) : undefined) ||
    indice.get(`${sNorm}___${cNorm}___sem_${semana.num}`) ||
    indice.get(`${cNorm}___sem_${semana.num}`);
  if (!data) return { temDado: false, pix: null, dinheiro: null, validadoTesouraria: false, total: 0 };
  return { temDado: true, pix: data.pix, dinheiro: data.dinheiro, total: data.total, validadoTesouraria: data.validadoTesouraria };
}

/** Grade completa de um mês: semanas, células e valores (para exportar). */
export function montarGradeEnvelopes(params: {
  lancamentos: LancamentoTesouraria[];
  unidades: UnidadeCadastrada[];
  ano: number;
  mes: number;
  setor: string;
}) {
  const semanas = semanasDoMes(params.ano, params.mes);
  const celulas = celulasDoSetor(params.unidades, params.lancamentos, params.setor);
  const indice = indexarLancamentos(params.lancamentos, semanas, { ano: params.ano, mes: params.mes, setor: params.setor });
  return {
    semanas,
    celulas,
    valores: celulas.map((c) => semanas.map((s) => valoresDaCelula(indice, c, s))),
  };
}
