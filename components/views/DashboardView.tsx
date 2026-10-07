'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { RotateCw, ShieldCheck, Menu, TrendingUp } from 'lucide-react';
import { AgregadoDashboard, UnidadeCadastrada, MembroItem } from '@/lib/types';
import { TreasuryService, SEM_SETOR } from '@/lib/treasury-service';
import { formatBRL, somarReais } from '@/lib/utils';

interface DashboardViewProps {
  /** false quando a tela está escondida: não busca dados no servidor */
  ativa?: boolean;
  anoSelecionado: number | string;
  onSelectAno: (ano: number | string) => void;
  /** Anos com relatórios na igreja (do primeiro até o atual), vindos do servidor */
  anosBase?: number[];
  onRefresh: () => void;
  onToggleMobileMenu?: () => void;
  isRefreshing?: boolean;
  onShowToast?: (msg: string) => void;
  unidades?: UnidadeCadastrada[];
  usuarioLogado?: MembroItem | null;
}

const NOMES_MESES = [
  'JANEIRO',
  'FEVEREIRO',
  'MARÇO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
];

const NOMES_MESES_ABREV = [
  'JAN',
  'FEV',
  'MAR',
  'ABR',
  'MAI',
  'JUN',
  'JUL',
  'AGO',
  'SET',
  'OUT',
  'NOV',
  'DEZ',
];

/**
 * Converte qualquer representação de dia da semana (ex: 'Quarta-feira', 'quarta', 'Sábado', 'sab', 3)
 * para o índice do JavaScript Date (0 = Domingo, 1 = Segunda, ..., 6 = Sábado).
 */
function getDiaSemanaIndex(dia?: string | number | null): number | null {
  if (dia === undefined || dia === null) return null;

  if (typeof dia === 'number' && Number.isInteger(dia)) {
    if (dia >= 0 && dia <= 6) return dia;
    if (dia === 7) return 0;
    return null;
  }

  const str = String(dia).trim();
  if (!str) return null;

  const num = Number(str);
  if (!isNaN(num) && Number.isInteger(num)) {
    if (num >= 0 && num <= 6) return num;
    if (num === 7) return 0;
  }

  const s = str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (s.includes('dom')) return 0;
  if (s.includes('seg')) return 1;
  if (s.includes('ter')) return 2;
  if (s.includes('qua')) return 3;
  if (s.includes('qui')) return 4;
  if (s.includes('sex')) return 5;
  if (s.includes('sab')) return 6;

  return null;
}

/**
 * Retorna quantas vezes cada dia da semana (0 = Dom a 6 = Sáb) ocorre em determinado mês e ano.
 */
function getContagemDiasSemanaNoMes(ano: number, mes: number): number[] {
  const contagem = [0, 0, 0, 0, 0, 0, 0];
  const totalDias = new Date(ano, mes, 0).getDate();
  for (let d = 1; d <= totalDias; d++) {
    const dow = new Date(ano, mes - 1, d).getDay();
    contagem[dow]++;
  }
  return contagem;
}

/** Mínimo de relatórios que cada célula ativa deve entregar por mês (1 por semana). */
const MINIMO_RELATORIOS_POR_CELULA_MES = 4;

/**
 * Relatórios previstos no mês para uma lista de células ativas.
 * Regra: cada célula entrega no mínimo 4 relatórios por mês. Se tiver dia de reunião
 * cadastrado e esse dia ocorrer 5 vezes no mês, são previstos 5.
 */
function calcularEncontrosPrevistosMes(
  ano: number,
  mes: number,
  unidades: UnidadeCadastrada[]
): number {
  if (!unidades || unidades.length === 0) return 0;
  const contagemDias = getContagemDiasSemanaNoMes(ano, mes);

  let total = 0;
  for (const u of unidades) {
    const dow = getDiaSemanaIndex(u.dia_semana);
    const ocorrencias = dow !== null ? contagemDias[dow] : 0;
    total += Math.max(MINIMO_RELATORIOS_POR_CELULA_MES, ocorrencias);
  }
  return total;
}

/** Mês ainda não começou: não entra no previsto (não há como ter entregue). */
function ehMesFuturo(ano: number, mes: number): boolean {
  const hoje = new Date();
  return ano > hoje.getFullYear() || (ano === hoje.getFullYear() && mes > hoje.getMonth() + 1);
}

/** Percentual de relatórios validados sobre os previstos (limitado a 100%). */
function percentualSobrePrevistos(validados: number, previstos: number): number {
  return previstos > 0 ? Math.min(100, Math.round((validados / previstos) * 100)) : 0;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  ativa = true,
  anoSelecionado,
  onSelectAno,
  onRefresh,
  onToggleMobileMenu,
  isRefreshing = false,
  unidades,
  usuarioLogado,
  anosBase = [],
}) => {
  const [unidadesCarregadas, setUnidadesCarregadas] = useState<UnidadeCadastrada[]>([]);

  // Totais por (ano, mês, setor) já somados no servidor (~100 linhas/ano em vez de milhares)
  const [agregados, setAgregados] = useState<AgregadoDashboard[]>([]);
  const [erroAgregados, setErroAgregados] = useState<string | null>(null);
  const anoConsulta: number | string =
    String(anoSelecionado).toLowerCase().startsWith('todos') || Number(anoSelecionado) === 0
      ? 'todos'
      : Number(anoSelecionado) || new Date().getFullYear();

  useEffect(() => {
    if (!ativa) return;
    let cancel = false;
    (async () => {
      const res = await TreasuryService.fetchDashboardResumo(anoConsulta, isRefreshing);
      if (cancel) return;
      setErroAgregados(res.error || null);
      if (!res.error) setAgregados(res.data);
    })();
    return () => {
      cancel = true;
    };
  }, [ativa, anoConsulta, isRefreshing]);

  useEffect(() => {
    let cancel = false;
    const carregar = async () => {
      try {
        const data = await TreasuryService.fetchUnidadesCadastradas();
        if (!cancel && data) {
          setUnidadesCarregadas(data);
        }
      } catch (err) {
        console.warn('Erro ao carregar unidades no Dashboard:', err);
      }
    };
    carregar();
    return () => {
      cancel = true;
    };
  }, [isRefreshing]);

  const unidadesCadastradas = unidades && unidades.length > 0 ? unidades : unidadesCarregadas;

  const [mesSelecionado, setMesSelecionado] = useState<string>(() => {
    const hoje = new Date();
    const mesAtualIndex = hoje.getMonth();
    return NOMES_MESES[mesAtualIndex] || 'SETEMBRO';
  });

  const scrollContainerRef1 = useRef<HTMLDivElement>(null);
  const scrollContainerRef2 = useRef<HTMLDivElement>(null);

  const isTodosAnos =
    String(anoSelecionado).toLowerCase() === 'todos' ||
    String(anoSelecionado).toLowerCase() === 'todos os anos' ||
    Number(anoSelecionado) === 0;

  const isTodosMeses =
    String(mesSelecionado).toUpperCase() === 'TODOS' ||
    String(mesSelecionado).toUpperCase() === 'TODOS OS MESES';

  const isModoAnosNoGrafico = isTodosAnos && !isTodosMeses;

  // Anos disponíveis
  const anosDisponiveis = useMemo(() => {
    const anosSet = new Set<number>();
    const anoAtualReal = new Date().getFullYear();
    anosBase.forEach((a) => anosSet.add(a));
    anosSet.add(anoAtualReal);
    agregados.forEach((a) => {
      if (a.ano > 2000) anosSet.add(a.ano);
    });
    return Array.from(anosSet).sort((a, b) => b - a);
  }, [agregados, anosBase]);

  // Meses disponíveis
  const mesesDisponiveis = useMemo(() => {
    const hoje = new Date();
    const anoAtualReal = hoje.getFullYear();
    const mesAtualIndex = hoje.getMonth();
    let baseMeses = NOMES_MESES;
    if (!isTodosAnos && Number(anoSelecionado) === anoAtualReal) {
      baseMeses = NOMES_MESES.slice(0, mesAtualIndex + 1);
    }
    return ['TODOS OS MESES', ...baseMeses];
  }, [anoSelecionado, isTodosAnos]);

  const numMesSelecionado = useMemo(() => {
    if (isTodosMeses) return 0;
    const idx = NOMES_MESES.indexOf(mesSelecionado.toUpperCase());
    return idx !== -1 ? idx + 1 : 0;
  }, [mesSelecionado, isTodosMeses]);

  // Totais do mês e ano selecionados
  const agregadosPeriodo = useMemo(() => {
    return agregados.filter((a) => {
      const matchAno = isTodosAnos || a.ano === Number(anoSelecionado);
      const matchMes = isTodosMeses || a.mes === Number(numMesSelecionado);
      return matchAno && matchMes;
    });
  }, [agregados, isTodosAnos, anoSelecionado, isTodosMeses, numMesSelecionado]);

  // Totais KPIs (somente relatórios validados)
  const totalMesPix = useMemo(() => somarReais(agregadosPeriodo, (a) => a.pix_validado), [agregadosPeriodo]);
  const totalMesEspecie = useMemo(() => somarReais(agregadosPeriodo, (a) => a.especie_validado), [agregadosPeriodo]);

  const totalMesGeral = Math.round((totalMesPix + totalMesEspecie) * 100) / 100;

  // Unidades mais baixas ativas na hierarquia (células):
  // 1. ativo === true
  // 2. do nível "célula" da igreja (eh_celula, calculado pelo servidor), quando informado
  // 3. não é pai de nenhuma outra unidade (ponta mais baixa da hierarquia)
  // A API já devolve só as unidades da igreja do usuário logado.
  const unidadesMaisBaixas = useMemo(() => {
    if (!unidadesCadastradas || unidadesCadastradas.length === 0) {
      return [];
    }
    const unidadesIgreja = unidadesCadastradas;

    // Identifica todos os IDs de unidades que possuem filhas (são 'pai' de alguma unidade)
    const idsQueSaoPais = new Set(
      unidadesIgreja
        .map((u) => u.pai_id)
        .filter((paiId): paiId is string => Boolean(paiId && String(paiId).trim()))
        .map((paiId) => String(paiId).trim().toLowerCase())
    );

    // Filtra apenas as unidades mais baixas na hierarquia (folhas / sem filhas):
    return unidadesIgreja.filter((u) => {
      // Regra 1: Apenas os ativos
      if (u.ativo !== true) return false;

      // Regra 2: deve ser do nível "célula" da igreja (quando o servidor souber informar)
      if (u.eh_celula === false) return false;

      // Regra 3: Não pode ser pai de nenhuma outra unidade (garante a ponta mais baixa da hierarquia)
      const idNorm = String(u.id).trim().toLowerCase();
      if (idsQueSaoPais.has(idNorm)) {
        return false;
      }

      return true;
    });
  }, [unidadesCadastradas]);

  // Contagem de células ativas (unidades de menor nível ativas)
  const celulasAtivas = unidadesMaisBaixas.length;

  // Meses (ano, mês) cobertos pelo filtro atual, sem meses que ainda não começaram
  const mesesDoPeriodo = useMemo(() => {
    const anoEfetivo = Number(anoSelecionado) || new Date().getFullYear();
    const anos = isTodosAnos ? anosDisponiveis : [anoEfetivo];
    const meses = isTodosMeses ? Array.from({ length: 12 }, (_, i) => i + 1) : [numMesSelecionado || new Date().getMonth() + 1];
    const lista: { ano: number; mes: number }[] = [];
    anos.forEach((ano) => meses.forEach((mes) => !ehMesFuturo(Number(ano), mes) && lista.push({ ano: Number(ano), mes })));
    return lista;
  }, [isTodosAnos, anosDisponiveis, anoSelecionado, isTodosMeses, numMesSelecionado]);

  // Relatórios previstos no período para um grupo de células (todas, ou as de um setor)
  const previstosNoPeriodo = useCallback(
    (celulas: UnidadeCadastrada[]) =>
      mesesDoPeriodo.reduce((acc, { ano, mes }) => acc + calcularEncontrosPrevistosMes(ano, mes, celulas), 0),
    [mesesDoPeriodo]
  );

  // Previstos do período: células ativas x máx(4, ocorrências do dia de reunião no mês)
  const relatoriosPrevistos = useMemo(
    () => previstosNoPeriodo(unidadesMaisBaixas),
    [previstosNoPeriodo, unidadesMaisBaixas]
  );

  // Dados do gráfico
  const mesesGrafico = useMemo(() => {
    if (isModoAnosNoGrafico) {
      const anosOrdenados = [...anosDisponiveis].sort((a, b) => a - b);
      return anosOrdenados.map((anoItem) => {
        const doAnoEMes = agregados.filter((a) => a.ano === anoItem && a.mes === Number(numMesSelecionado));

        const esp = somarReais(doAnoEMes, (a) => a.especie_validado);
        const pix = somarReais(doAnoEMes, (a) => a.pix_validado);
        const mesItem = Number(numMesSelecionado) || 1;
        const previstos = ehMesFuturo(anoItem, mesItem)
          ? 0
          : calcularEncontrosPrevistosMes(anoItem, mesItem, unidadesMaisBaixas);

        const totalRelatorios = doAnoEMes.reduce((acc, a) => acc + a.enviados, 0);
        const validados = doAnoEMes.reduce((acc, a) => acc + a.validados, 0);
        // % = validados pela tesouraria / previstos para o período
        const perc = percentualSobrePrevistos(validados, previstos);

        return {
          nome: String(anoItem),
          esp,
          pix,
          total: Math.round((esp + pix) * 100) / 100,
          confirmados: validados,
          validados,
          totalRelatorios,
          previstos,
          perc,
        };
      });
    }

    return NOMES_MESES_ABREV.map((nomeAbrev, idx) => {
      const mesNum = idx + 1;
      const doMes = agregados.filter((a) => (isTodosAnos || a.ano === Number(anoSelecionado)) && a.mes === mesNum);

      const esp = somarReais(doMes, (a) => a.especie_validado);
      const pix = somarReais(doMes, (a) => a.pix_validado);

      const anosDoMes = isTodosAnos ? anosDisponiveis : [Number(anoSelecionado) || new Date().getFullYear()];
      const previstos = anosDoMes.reduce(
        (acc, anoItem) =>
          ehMesFuturo(Number(anoItem), mesNum) ? acc : acc + calcularEncontrosPrevistosMes(Number(anoItem), mesNum, unidadesMaisBaixas),
        0
      );

      const totalRelatorios = doMes.reduce((acc, a) => acc + a.enviados, 0);
      const validados = doMes.reduce((acc, a) => acc + a.validados, 0);
      // % = validados pela tesouraria / previstos para o mês
      const perc = percentualSobrePrevistos(validados, previstos);

      return {
        nome: nomeAbrev,
        esp,
        pix,
        total: Math.round((esp + pix) * 100) / 100,
        confirmados: validados,
        validados,
        totalRelatorios,
        previstos,
        perc,
      };
    });
  }, [
    isModoAnosNoGrafico,
    anosDisponiveis,
    agregados,
    numMesSelecionado,
    unidadesMaisBaixas,
    isTodosAnos,
    anoSelecionado,
  ]);

  const maxOferta = useMemo(() => {
    const maxVal = Math.max(...mesesGrafico.map((m) => Math.max(m.esp, m.pix)), 0);
    return maxVal > 0 ? maxVal * 1.3 : 1000;
  }, [mesesGrafico]);

  // Centraliza no bloco o mês atual ou o mês selecionado via rolagem horizontal automática (sem alterar ou distorcer o layout)
  const centralizarMesNoGrafico = useCallback((suave = true) => {
    let indiceAlvo = new Date().getMonth();

    if (isModoAnosNoGrafico) {
      const anoAlvo = Number(anoSelecionado) || new Date().getFullYear();
      const idx = mesesGrafico.findIndex((m) => Number(m.nome) === anoAlvo);
      if (idx !== -1) indiceAlvo = idx;
      else if (mesesGrafico.length > 0) indiceAlvo = mesesGrafico.length - 1;
    } else {
      if (!isTodosMeses && numMesSelecionado > 0) {
        indiceAlvo = numMesSelecionado - 1;
      } else {
        indiceAlvo = new Date().getMonth();
      }
    }

    const containers = [scrollContainerRef1.current, scrollContainerRef2.current];
    containers.forEach((container) => {
      if (!container) return;
      const targetColumn = container.querySelector<HTMLElement>(`[data-col-index="${indiceAlvo}"]`);
      if (!targetColumn) return;

      const targetLeft = targetColumn.offsetLeft;
      const targetWidth = targetColumn.offsetWidth;
      const containerWidth = container.clientWidth;
      const targetScrollLeft = targetLeft - (containerWidth / 2) + (targetWidth / 2);

      container.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: suave ? 'smooth' : 'auto',
      });
    });
  }, [isModoAnosNoGrafico, anoSelecionado, mesesGrafico, isTodosMeses, numMesSelecionado]);

  // Efeito para centralizar o mês selecionado/atual ao carregar ou alterar filtros
  useEffect(() => {
    const timer = setTimeout(() => {
      centralizarMesNoGrafico(true);
    }, 150);
    return () => clearTimeout(timer);
  }, [centralizarMesNoGrafico]);

  // Efeito para manter a centralização em caso de redimensionamento da janela
  useEffect(() => {
    const handleResize = () => {
      centralizarMesNoGrafico(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [centralizarMesNoGrafico]);

  // Sincroniza a rolagem horizontal suave entre os dois gráficos mantendo-os alinhados
  useEffect(() => {
    const c1 = scrollContainerRef1.current;
    const c2 = scrollContainerRef2.current;
    if (!c1 || !c2) return;

    let isSyncing1 = false;
    let isSyncing2 = false;

    const onScroll1 = () => {
      if (isSyncing1) return;
      isSyncing2 = true;
      c2.scrollLeft = c1.scrollLeft;
      requestAnimationFrame(() => {
        isSyncing2 = false;
      });
    };

    const onScroll2 = () => {
      if (isSyncing2) return;
      isSyncing1 = true;
      c1.scrollLeft = c2.scrollLeft;
      requestAnimationFrame(() => {
        isSyncing1 = false;
      });
    };

    c1.addEventListener('scroll', onScroll1, { passive: true });
    c2.addEventListener('scroll', onScroll2, { passive: true });

    return () => {
      c1.removeEventListener('scroll', onScroll1);
      c2.removeEventListener('scroll', onScroll2);
    };
  }, []);

  const formatarValorColuna = (val: number, temMovimento = false): string => {
    if (val === undefined || val === null) return '';
    if (val <= 0) return temMovimento ? '0,00' : '';
    return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getCorPercentual = (perc: number) => {
    if (perc > 85) {
      return {
        text: 'text-emerald-400',
        bar: 'bg-emerald-500',
      };
    }
    if (perc >= 65) {
      return {
        text: 'text-amber-400',
        bar: 'bg-amber-500',
      };
    }
    return {
      text: 'text-rose-400',
      bar: 'bg-rose-500',
    };
  };

  // Ranking por setores:
  // - Contagem de células ativas por setor mantém exatamente as mesmas regras de células ativas (unidadesMaisBaixas)
  // - Porcentagem é a relação de relatórios validados sobre os relatórios que foram enviados pelo setor no período filtrado
  const rankingSetores = useMemo(() => {
    // Mapeamento de id do setor para nome
    const mapaSetoresPorId = new Map<string, string>();
    unidadesCadastradas.forEach((u) => {
      mapaSetoresPorId.set(u.id, u.nome);
    });

    // Todos os setores a partir das unidades de menor nível ativas da igreja
    const todosSetores = new Set<string>();
    unidadesMaisBaixas.forEach((u) => {
      if (u.pai_id) {
        const nomeSetor = (mapaSetoresPorId.get(u.pai_id) || '').trim();
        if (nomeSetor) todosSetores.add(nomeSetor);
      }
    });

    // Sem unidades cadastradas: usa os setores que aparecem nos próprios relatórios
    if (todosSetores.size === 0) {
      agregados.forEach((a) => todosSetores.add(a.setor));
    }

    // Contagem de relatórios enviados e validados por setor no período filtrado
    const enviadosPorSetor = new Map<string, number>();
    const validadosPorSetor = new Map<string, number>();

    // O setor de cada linha já vem resolvido pelo servidor (unidade pai da célula)
    agregadosPeriodo.forEach((a) => {
      enviadosPorSetor.set(a.setor, (enviadosPorSetor.get(a.setor) || 0) + a.enviados);
      validadosPorSetor.set(a.setor, (validadosPorSetor.get(a.setor) || 0) + a.validados);
    });

    const lista = Array.from(todosSetores).map((nome) => {
      // Contagem de células ativas do setor com as mesmas regras rigorosas de células ativas da igreja
      const celulasDoSetor = unidadesMaisBaixas.filter((u) => {
        const nomeSetor = (mapaSetoresPorId.get(u.pai_id || '') || '').trim();
        return nomeSetor.toLowerCase() === nome.toLowerCase();
      });
      const ativas = celulasDoSetor.length;
      const previstos = previstosNoPeriodo(celulasDoSetor);

      const enviados = enviadosPorSetor.get(nome) || 0;
      const validados = validadosPorSetor.get(nome) || 0;

      // % = validados pela tesouraria / previstos do setor no período
      // (previstos = células ativas do setor x máx(4, ocorrências do dia de reunião no mês))
      const perc = percentualSobrePrevistos(validados, previstos);

      return { nome, ativas, enviados, validados, previstos, perc };
    });

    lista.sort((a, b) => b.perc - a.perc || b.validados - a.validados || b.previstos - a.previstos || b.ativas - a.ativas);
    return lista;
  }, [unidadesCadastradas, unidadesMaisBaixas, agregados, agregadosPeriodo, previstosNoPeriodo]);

  const totalLancadosMes = agregadosPeriodo.reduce((acc, a) => acc + a.enviados, 0);
  const totalValidadosMes = agregadosPeriodo.reduce((acc, a) => acc + a.validados, 0);
  const percPrevistosMes =
    relatoriosPrevistos > 0 ? Math.min(100, Math.round((totalLancadosMes / relatoriosPrevistos) * 100)) : 0;
  const percValidadosMes =
    relatoriosPrevistos > 0 ? Math.min(100, Math.round((totalValidadosMes / relatoriosPrevistos) * 100)) : 0;

  const corPrevistosMes = getCorPercentual(percPrevistosMes);
  const corValidadosMes = getCorPercentual(percValidadosMes);

  return (
    <div className="p-3.5 sm:p-6 space-y-4 sm:space-y-6 max-w-[1600px] mx-auto text-slate-100">
      {erroAgregados && (
        <div className="bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs rounded-lg px-3 py-2">
          Não foi possível carregar os totais: {erroAgregados}
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2d334d] pb-4">
        <div className="flex items-center gap-2.5">
          {onToggleMobileMenu && (
            <button
              onClick={onToggleMobileMenu}
              className="md:hidden p-2 -ml-1 rounded-lg text-slate-300 hover:text-white hover:bg-[#282e48] transition-colors cursor-pointer"
              aria-label="Abrir Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <div>
            <p className="text-[11px] sm:text-xs font-medium text-slate-400">Tesouraria Geral</p>
            <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight">
              DashBoard | Ofertas Célula
            </h2>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2 sm:gap-3 ml-auto">
          {/* Ano */}
          <div className="flex items-center gap-1.5 bg-[#22273c] px-3 py-1.5 rounded-lg border border-[#343b57]">
            <span className="text-[11px] sm:text-xs text-slate-400">Ano:</span>
            <select
              value={isTodosAnos ? 'todos' : anoSelecionado}
              onChange={(e) =>
                onSelectAno(e.target.value === 'todos' ? 'todos' : Number(e.target.value))
              }
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
            >
              <option value="todos" className="bg-[#1c2030] text-white">
                TODOS OS ANOS
              </option>
              {anosDisponiveis.map((ano) => (
                <option key={ano} value={ano} className="bg-[#1c2030] text-white">
                  {ano}
                </option>
              ))}
            </select>
          </div>

          {/* Mês */}
          <div className="flex items-center gap-1.5 bg-[#22273c] px-3 py-1.5 rounded-lg border border-[#343b57]">
            <select
              value={mesSelecionado}
              onChange={(e) => setMesSelecionado(e.target.value)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
            >
              {mesesDisponiveis.map((m) => (
                <option key={m} value={m} className="bg-[#1c2030] text-white">
                  {m}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={onRefresh}
            className="p-2 rounded-lg hover:bg-[#282d46] text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Atualizar Dashboard"
          >
            <RotateCw className={`w-4 sm:w-5 h-4 sm:h-5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 5 KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
        <div className="bg-[#24293f] p-3 sm:p-4 rounded-xl border border-[#323955]">
          <p className="text-[11px] sm:text-xs text-slate-400 font-medium mb-1 truncate">
            {isModoAnosNoGrafico ? `Total ${mesSelecionado} (PIX)` : isTodosMeses ? 'Total Período (PIX)' : 'Total Mês PIX'}
          </p>
          <p className="text-base sm:text-xl lg:text-2xl font-extrabold text-white tracking-tight truncate font-mono">
            {formatBRL(totalMesPix)}
          </p>
        </div>

        <div className="bg-[#24293f] p-3 sm:p-4 rounded-xl border border-[#323955]">
          <p className="text-[11px] sm:text-xs text-slate-400 font-medium mb-1 truncate">
            {isModoAnosNoGrafico ? `Total ${mesSelecionado} (Espécie)` : isTodosMeses ? 'Total Período (Espécie)' : 'Total Oferta Espécie'}
          </p>
          <p className="text-base sm:text-xl lg:text-2xl font-extrabold text-white tracking-tight truncate font-mono">
            {formatBRL(totalMesEspecie)}
          </p>
        </div>

        <div className="bg-[#24293f] p-3 sm:p-4 rounded-xl border border-[#323955] col-span-2 lg:col-span-1">
          <p className="text-[11px] sm:text-xs text-slate-400 font-medium mb-1 truncate">
            {isModoAnosNoGrafico ? `Total Validado (${mesSelecionado})` : isTodosMeses ? 'Total Validado Geral' : 'Total Validado'}
          </p>
          <p className="text-base sm:text-xl lg:text-2xl font-extrabold text-emerald-400 tracking-tight truncate font-mono">
            {formatBRL(totalMesGeral)}
          </p>
        </div>

        <div className="bg-[#24293f] p-3 sm:p-4 rounded-xl border border-[#323955] text-center">
          <p className="text-[11px] sm:text-xs text-slate-400 font-medium mb-1 truncate">Células Ativas</p>
          <p className="text-2xl sm:text-3xl font-black text-white tracking-tight font-mono">
            {celulasAtivas}
          </p>
        </div>

        <div className="bg-[#24293f] p-3 sm:p-4 rounded-xl border border-[#323955] text-center flex flex-col justify-center">
          <p className="text-[11px] sm:text-xs text-slate-400 font-medium mb-1 truncate">
            Relatórios Validados / Previstos
          </p>
          <p className="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-tight flex items-center justify-center gap-1.5 font-mono">
            <span className="text-emerald-400">{totalValidadosMes}</span>
            <span className="text-slate-500 font-normal">/</span>
            <span>{relatoriosPrevistos}</span>
          </p>
        </div>
      </div>

      {/* Main Grid: Left Column (~67%) and Right Column (~33%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* Left Column: Ofertas por Mês R$ & Relatórios Recebidos Mês a Mês */}
        <div className="lg:col-span-8 flex flex-col gap-4 sm:gap-5">
          {/* Ofertas por Mês R$ */}
          <div className="bg-[#24293f] p-3.5 sm:p-4 rounded-xl border border-[#323955] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <h3 className="text-sm font-bold text-white">
                {isModoAnosNoGrafico
                  ? `Ofertas de ${mesSelecionado} por Ano R$`
                  : isTodosAnos && isTodosMeses
                  ? 'Ofertas por Mês R$ (Consolidado Todos os Anos)'
                  : 'Ofertas por Mês R$'}
              </h3>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-3 h-3 rounded-xs bg-[#22c55e]"></span>
                  PIX
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-3 h-3 rounded-xs bg-[#cbd5e1]"></span>
                  Esp
                </span>
              </div>
            </div>

            {/* Bar Chart */}
            <div ref={scrollContainerRef1} className="overflow-x-auto pb-1 scrollbar-thin">
              <div
                className={`h-52 sm:h-56 items-end pt-6 pb-2 px-3 sm:px-4 border-b border-[#303752] ${
                  isModoAnosNoGrafico
                    ? 'w-full flex justify-around gap-2 sm:gap-6 min-w-[320px]'
                    : 'min-w-[760px] xl:min-w-0 grid grid-cols-12 gap-1.5 sm:gap-2'
                }`}
              >
                {mesesGrafico.map((m, idx) => {
                  const altPix = maxOferta > 0 ? (m.pix / maxOferta) * 100 : 0;
                  const altEsp = maxOferta > 0 ? (m.esp / maxOferta) * 100 : 0;
                  const temMovimento = m.total > 0;
                  const valPixStr = formatarValorColuna(m.pix, temMovimento);
                  const valEspStr = formatarValorColuna(m.esp, temMovimento);
                  return (
                    <div
                      key={m.nome}
                      data-col-index={idx}
                      className="flex flex-col items-center h-full justify-end group relative"
                    >
                      <div className="w-full h-36 sm:h-40 flex items-end justify-center gap-1 px-0.5">
                        {/* PIX Column */}
                        <div className="flex flex-col items-center justify-end h-full min-w-0">
                          {valPixStr && (
                            <span className="text-[7.5px] sm:text-[9px] font-bold text-[#22c55e] mb-1 leading-none text-center whitespace-nowrap select-none font-mono">
                              {valPixStr}
                            </span>
                          )}
                          <div
                            style={{
                              height: `${m.pix > 0 ? Math.max(6, Math.round(altPix)) : temMovimento ? 2 : 0}%`,
                            }}
                            className={`w-3.5 sm:w-4.5 transition-all duration-300 ${
                              m.pix > 0
                                ? 'bg-[#22c55e] hover:bg-[#16a34a]'
                                : temMovimento
                                ? 'bg-[#22c55e]/30'
                                : 'bg-transparent'
                            } rounded-t-xs`}
                          />
                        </div>

                        {/* Espécie Column */}
                        <div className="flex flex-col items-center justify-end h-full min-w-0">
                          {valEspStr && (
                            <span className="text-[7.5px] sm:text-[9px] font-bold text-slate-300 mb-1 leading-none text-center whitespace-nowrap select-none font-mono">
                              {valEspStr}
                            </span>
                          )}
                          <div
                            style={{
                              height: `${m.esp > 0 ? Math.max(6, Math.round(altEsp)) : temMovimento ? 2 : 0}%`,
                            }}
                            className={`w-3.5 sm:w-4.5 transition-all duration-300 ${
                              m.esp > 0
                                ? 'bg-[#cbd5e1] hover:bg-white'
                                : temMovimento
                                ? 'bg-[#cbd5e1]/30'
                                : 'bg-transparent'
                            } rounded-t-xs`}
                          />
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 mt-1.5">{m.nome}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Relatórios Recebidos Mês a Mês (%) */}
          <div className="bg-[#24293f] p-4 sm:p-5 rounded-xl border border-[#323955] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-white">
                  {isModoAnosNoGrafico
                    ? `Relatórios Recebidos de ${mesSelecionado} por Ano (%)`
                    : 'Relatórios Recebidos Mês a Mês (%)'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  % de relatórios validados pela tesouraria em relação aos previstos (células ativas × mín. 4 por mês)
                </p>
              </div>
            </div>

            <div ref={scrollContainerRef2} className="overflow-x-auto pb-1 scrollbar-thin">
              <div
                className={`h-56 sm:h-60 items-end pt-4 pb-2 px-3 sm:px-4 border-b border-[#303752] ${
                  isModoAnosNoGrafico
                    ? 'w-full flex justify-around gap-2 sm:gap-6 min-w-[320px]'
                    : 'min-w-[760px] xl:min-w-0 grid grid-cols-12 gap-1.5 sm:gap-2'
                }`}
              >
                {mesesGrafico.map((m, idx) => {
                  const isRed = m.perc < 80 && m.perc > 0;
                  const barColor = isRed ? 'bg-[#c85a5a]' : 'bg-[#22c55e]';
                  return (
                    <div
                      key={m.nome}
                      data-col-index={idx}
                      className="flex flex-col items-center h-full justify-end group relative"
                      title={`${m.nome}: ${m.validados} validados de ${m.previstos} previstos (${m.perc}%) • ${m.totalRelatorios} enviados`}
                    >
                      <div className="h-5 flex items-center justify-center mb-1">
                        {m.perc > 0 && (
                          <span className="text-[9px] text-slate-300 font-bold font-mono">
                            {m.perc}%
                          </span>
                        )}
                      </div>
                      <div className="w-full h-36 sm:h-40 flex items-end justify-center px-0.5">
                        <div
                          style={{ height: `${m.perc > 0 ? Math.max(5, m.perc) : 0}%` }}
                          className={`w-3.5 sm:w-4.5 transition-all duration-300 ${
                            m.perc > 0 ? barColor : 'bg-transparent'
                          } rounded-t-xs`}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 mt-2">{m.nome}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Relatório Lançados x Recebidos & Ranking por Setores */}
        <div className="lg:col-span-4 flex flex-col gap-4 sm:gap-5">
          {/* Relatório Lançados x Recebidos */}
          <div className="bg-[#24293f] p-4 sm:p-5 rounded-xl border border-[#323955] flex flex-col justify-center space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Relatório Lançados x Recebidos</h3>
                <span className="text-[10px] text-slate-400 font-medium font-mono">
                  ({isTodosMeses ? 'Todos os Meses' : mesSelecionado}/{isTodosAnos ? 'Todos os Anos' : anoSelecionado})
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                Percentual de envelopes em relação à meta prevista por célula
              </p>
            </div>

            {/* Relat. Lançados */}
            <div>
              <div className="flex justify-between items-baseline text-xs font-semibold text-slate-300 mb-1">
                <span>Relat. Lançados</span>
                <span className={`font-bold font-mono ${corPrevistosMes.text}`}>{percPrevistosMes}%</span>
              </div>
              <p className="text-[10px] text-slate-400 mb-1.5 font-mono">
                Lançados pelas células ({totalLancadosMes} de {relatoriosPrevistos} previstos)
              </p>
              <div className="w-full bg-[#181b2a] rounded-sm h-5 overflow-hidden p-0.5 border border-[#303752]">
                <div
                  className={`${corPrevistosMes.bar} h-full rounded-xs transition-all duration-500`}
                  style={{ width: `${Math.min(100, Math.max(0, percPrevistosMes))}%` }}
                />
              </div>
            </div>

            {/* Relatórios Validados */}
            <div>
              <div className="flex justify-between items-baseline text-xs font-semibold text-slate-300 mb-1">
                <span>Relatórios Validados</span>
                <span className={`font-bold font-mono ${corValidadosMes.text}`}>{percValidadosMes}%</span>
              </div>
              <p className="text-[10px] text-slate-400 mb-1.5 font-mono">
                Confirmados pela Tesouraria ({totalValidadosMes} de {relatoriosPrevistos} previstos)
              </p>
              <div className="w-full bg-[#181b2a] rounded-sm h-5 overflow-hidden p-0.5 border border-[#303752]">
                <div
                  className={`${corValidadosMes.bar} h-full rounded-xs transition-all duration-500`}
                  style={{ width: `${Math.min(100, Math.max(0, percValidadosMes))}%` }}
                />
              </div>
            </div>
          </div>

          {/* Ranking por Setores */}
          <div className="bg-[#24293f] p-4 sm:p-5 rounded-xl border border-[#323955] flex-1 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Ranking por Setores</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  ({isTodosMeses ? 'Todos os Meses' : mesSelecionado}/{isTodosAnos ? 'Todos os Anos' : anoSelecionado}) • Validados / Previstos
                </p>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-semibold bg-[#1a1e30] px-2 py-1 rounded-lg border border-[#303752] self-start sm:self-auto shrink-0">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  &gt;85%
                </span>
                <span className="flex items-center gap-1 text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  65-85%
                </span>
                <span className="flex items-center gap-1 text-rose-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  &lt;65%
                </span>
              </div>
            </div>

            <div className="flex flex-col divide-y divide-[#2d334c]/50">
              {rankingSetores.map((s, idx) => {
                const cor = getCorPercentual(s.perc);
                return (
                  <div
                    key={s.nome}
                    className="flex items-center justify-between text-xs py-2 px-1.5 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-4 text-xs font-bold text-slate-400 shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-bold text-white tracking-wide truncate">{s.nome}</span>
                      <span className="text-[11px] text-slate-400 shrink-0 font-medium">
                        ({s.ativas} {s.ativas === 1 ? 'célula ativa' : 'células ativas'})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="text-[10px] text-slate-400 font-mono"
                        title={`${s.validados} validados de ${s.previstos} previstos • ${s.enviados} enviados`}
                      >
                        ({s.validados}/{s.previstos})
                      </span>
                      <span className={`font-bold text-sm shrink-0 pl-1 font-mono ${cor.text}`}>
                        {s.perc}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
