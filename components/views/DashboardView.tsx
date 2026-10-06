'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { RotateCw, ShieldCheck, Menu, TrendingUp } from 'lucide-react';
import { LancamentoTesouraria, UnidadeCadastrada, MembroItem } from '@/lib/types';
import { TreasuryService } from '@/lib/treasury-service';
import { formatBRL } from '@/lib/utils';

interface DashboardViewProps {
  lancamentos: LancamentoTesouraria[];
  anoSelecionado: number | string;
  onSelectAno: (ano: number | string) => void;
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

/**
 * Retorna quantas semanas o mês filtrado tem (calendário: do primeiro ao último dia do mês).
 */
function getSemanasDoMes(ano: number, mes: number): number {
  const totalDias = new Date(ano, mes, 0).getDate();
  const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay(); // 0 = Domingo
  return Math.ceil((primeiroDiaSemana + totalDias) / 7);
}

/**
 * Calcula quantos encontros uma lista de unidades ativas de menor nível teria no mês e ano.
 * Regras:
 * 1. Para cada unidade com dia_semana cadastrado: quantas vezes aquele dia da semana ocorre no mês filtrado.
 * 2. Se a unidade cumprir os requisitos mas não tiver dia da semana cadastrado: em relação a quantas semanas o mês filtrado tem.
 */
function calcularEncontrosPrevistosMes(
  ano: number,
  mes: number,
  unidades: UnidadeCadastrada[]
): number {
  if (!unidades || unidades.length === 0) return 0;
  const contagemDias = getContagemDiasSemanaNoMes(ano, mes);
  const semanasNoMes = getSemanasDoMes(ano, mes);

  let total = 0;
  for (const u of unidades) {
    const dow = getDiaSemanaIndex(u.dia_semana);
    if (dow !== null) {
      total += contagemDias[dow];
    } else {
      total += semanasNoMes;
    }
  }
  return total;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  lancamentos,
  anoSelecionado,
  onSelectAno,
  onRefresh,
  onToggleMobileMenu,
  isRefreshing = false,
  unidades,
  usuarioLogado,
}) => {
  const [unidadesCarregadas, setUnidadesCarregadas] = useState<UnidadeCadastrada[]>([]);

  useEffect(() => {
    let cancel = false;
    const carregar = async () => {
      try {
        const data = await TreasuryService.fetchUnidadesCadastradas();
        if (!cancel && data && data.length > 0) {
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
    anosSet.add(anoAtualReal);
    lancamentos.forEach((l) => {
      if (l.ano && typeof l.ano === 'number' && l.ano > 2000) {
        anosSet.add(l.ano);
      }
    });
    return Array.from(anosSet).sort((a, b) => b - a);
  }, [lancamentos]);

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

  // Apenas relatórios validados (TESOURARIA_RECEB === true)
  const lancamentosValidados = useMemo(() => {
    return lancamentos.filter((l) => l.TESOURARIA_RECEB === true);
  }, [lancamentos]);

  // Lançamentos validados do mês e ano selecionados
  const lancamentosMesAtual = useMemo(() => {
    return lancamentosValidados.filter((l) => {
      const matchAno = isTodosAnos || Number(l.ano) === Number(anoSelecionado);
      const matchMes = isTodosMeses || Number(l.mes) === Number(numMesSelecionado);
      return matchAno && matchMes;
    });
  }, [lancamentosValidados, isTodosAnos, anoSelecionado, isTodosMeses, numMesSelecionado]);

  // Todos os lançamentos do mês e ano
  const lancamentosTodosMesAtual = useMemo(() => {
    return lancamentos.filter((l) => {
      const matchAno = isTodosAnos || Number(l.ano) === Number(anoSelecionado);
      const matchMes = isTodosMeses || Number(l.mes) === Number(numMesSelecionado);
      return matchAno && matchMes;
    });
  }, [lancamentos, isTodosAnos, anoSelecionado, isTodosMeses, numMesSelecionado]);

  // Totais KPIs
  const totalMesPix = useMemo(() => {
    return lancamentosMesAtual.reduce((acc, curr) => acc + (curr.valorPix ?? curr.ValorOferta ?? 0), 0);
  }, [lancamentosMesAtual]);

  const totalMesEspecie = useMemo(() => {
    return lancamentosMesAtual.reduce(
      (acc, curr) => acc + (curr.valorEspecie ?? curr.OfertaEspecie ?? 0),
      0
    );
  }, [lancamentosMesAtual]);

  const totalMesGeral = totalMesPix + totalMesEspecie;

  const NIVEL_TIPO_CELULA_ID = '320a19aa-7e16-457c-95e5-d8d3cbfe9945';
  const IGREJA_ID_PADRAO = 'ff600f5f-b91f-4826-bde2-3976e718877c';

  // Unidades mais baixas ativas na hierarquia da igreja do usuário logado:
  // 1. ativo === true
  // 2. Igreja relacionada ao usuário logado
  // 3. nivel_tipo_id === '320a19aa-7e16-457c-95e5-d8d3cbfe9945' (se informado)
  // 4. Não é pai de nenhuma outra unidade (ponta mais baixa da hierarquia)
  const unidadesMaisBaixas = useMemo(() => {
    if (!unidadesCadastradas || unidadesCadastradas.length === 0) {
      return [];
    }

    // Igreja do usuário logado
    const igrejaIdLogada = (
      usuarioLogado?.igreja_id ||
      usuarioLogado?.churchId ||
      IGREJA_ID_PADRAO
    ).trim().toLowerCase();

    // Filtra as unidades vinculadas à igreja do usuário
    const unidadesIgreja = unidadesCadastradas.filter((u) => {
      if (!u.igreja_id) return true; // Se a listagem já veio filtrada pela igreja na API
      return String(u.igreja_id).trim().toLowerCase() === igrejaIdLogada;
    });

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

      // Regra 2: Se tiver nivel_tipo_id, deve ser o nível mais baixo (célula)
      if (u.nivel_tipo_id) {
        if (String(u.nivel_tipo_id).trim().toLowerCase() !== NIVEL_TIPO_CELULA_ID.toLowerCase()) {
          return false;
        }
      }

      // Regra 3: Não pode ser pai de nenhuma outra unidade (garante a ponta mais baixa da hierarquia)
      const idNorm = String(u.id).trim().toLowerCase();
      if (idsQueSaoPais.has(idNorm)) {
        return false;
      }

      return true;
    });
  }, [unidadesCadastradas, usuarioLogado]);

  // Contagem de células ativas (unidades de menor nível ativas)
  const celulasAtivas = unidadesMaisBaixas.length;

  const fatorMeses = useMemo(() => {
    if (isTodosMeses) {
      return isTodosAnos || Number(anoSelecionado) === new Date().getFullYear()
        ? new Date().getMonth() + 1
        : 12;
    }
    return 1;
  }, [isTodosMeses, isTodosAnos, anoSelecionado]);

  // Cálculo de relatórios previstos:
  // Quantos encontros de cada unidade de nível mais baixo ativa teriam dentro do mês filtrado:
  // - Para unidades com dia_semana: quantas vezes aquele dia da semana ocorre dentro do mês.
  // - Se não tiver dia_semana cadastrado: quantas semanas o mês filtrado tem.
  const relatoriosPrevistos = useMemo(() => {
    if (unidadesMaisBaixas.length === 0) {
      const multAnos = isTodosAnos ? Math.max(1, anosDisponiveis.length) : 1;
      return celulasAtivas * 4 * fatorMeses * multAnos;
    }

    const anoEfetivo = Number(anoSelecionado) || new Date().getFullYear();

    if (isTodosMeses) {
      const anos = isTodosAnos ? anosDisponiveis : [anoEfetivo];
      let total = 0;
      for (const anoItem of anos) {
        const anoNum = Number(anoItem) || new Date().getFullYear();
        const maxMes = anoNum === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;
        for (let m = 1; m <= maxMes; m++) {
          total += calcularEncontrosPrevistosMes(anoNum, m, unidadesMaisBaixas);
        }
      }
      return total;
    }

    const mesEfetivo = numMesSelecionado > 0 ? numMesSelecionado : new Date().getMonth() + 1;

    if (isTodosAnos) {
      let total = 0;
      for (const anoItem of anosDisponiveis) {
        total += calcularEncontrosPrevistosMes(Number(anoItem), mesEfetivo, unidadesMaisBaixas);
      }
      return total;
    }

    return calcularEncontrosPrevistosMes(anoEfetivo, mesEfetivo, unidadesMaisBaixas);
  }, [
    unidadesMaisBaixas,
    celulasAtivas,
    fatorMeses,
    isTodosAnos,
    isTodosMeses,
    anoSelecionado,
    numMesSelecionado,
    anosDisponiveis,
  ]);

  // Dados do gráfico
  const mesesGrafico = useMemo(() => {
    if (isModoAnosNoGrafico) {
      const anosOrdenados = [...anosDisponiveis].sort((a, b) => a - b);
      return anosOrdenados.map((anoItem) => {
        const doAnoEMes = lancamentosValidados.filter(
          (l) => Number(l.ano) === anoItem && Number(l.mes) === Number(numMesSelecionado)
        );
        const esp = doAnoEMes.reduce(
          (acc, curr) => acc + Number(curr.valorEspecie ?? curr.OfertaEspecie ?? 0),
          0
        );
        const pix = doAnoEMes.reduce(
          (acc, curr) => acc + Number(curr.valorPix ?? curr.ValorOferta ?? 0),
          0
        );
        const previstos =
          unidadesMaisBaixas.length > 0
            ? calcularEncontrosPrevistosMes(anoItem, Number(numMesSelecionado) || 1, unidadesMaisBaixas)
            : celulasAtivas * 4;
        const confirmados = doAnoEMes.length;
        const perc = previstos > 0 && confirmados > 0 ? Math.min(100, Math.round((confirmados / previstos) * 100)) : 0;
        return {
          nome: String(anoItem),
          esp,
          pix,
          total: esp + pix,
          confirmados,
          previstos,
          perc,
        };
      });
    }

    return NOMES_MESES_ABREV.map((nomeAbrev, idx) => {
      const mesNum = idx + 1;
      const doMes = lancamentosValidados.filter((l) => {
        const matchAno = isTodosAnos || Number(l.ano) === Number(anoSelecionado);
        return matchAno && Number(l.mes) === mesNum;
      });

      const esp = doMes.reduce(
        (acc, curr) => acc + Number(curr.valorEspecie ?? curr.OfertaEspecie ?? 0),
        0
      );
      const pix = doMes.reduce(
        (acc, curr) => acc + Number(curr.valorPix ?? curr.ValorOferta ?? 0),
        0
      );

      let previstos = 0;
      if (unidadesMaisBaixas.length > 0) {
        if (isTodosAnos) {
          for (const anoItem of anosDisponiveis) {
            previstos += calcularEncontrosPrevistosMes(Number(anoItem), mesNum, unidadesMaisBaixas);
          }
        } else {
          const anoEfetivo = Number(anoSelecionado) || new Date().getFullYear();
          previstos = calcularEncontrosPrevistosMes(anoEfetivo, mesNum, unidadesMaisBaixas);
        }
      } else {
        const multAnos = isTodosAnos ? Math.max(1, anosDisponiveis.length) : 1;
        previstos = celulasAtivas * 4 * multAnos;
      }

      const confirmados = doMes.length;
      const perc = previstos > 0 && confirmados > 0 ? Math.min(100, Math.round((confirmados / previstos) * 100)) : 0;

      return {
        nome: nomeAbrev,
        esp,
        pix,
        total: esp + pix,
        confirmados,
        previstos,
        perc,
      };
    });
  }, [
    isModoAnosNoGrafico,
    anosDisponiveis,
    lancamentosValidados,
    numMesSelecionado,
    unidadesMaisBaixas,
    celulasAtivas,
    isTodosAnos,
    anoSelecionado,
  ]);

  const maxOferta = useMemo(() => {
    const maxVal = Math.max(...mesesGrafico.map((m) => Math.max(m.esp, m.pix)), 0);
    return maxVal > 0 ? maxVal * 1.3 : 1000;
  }, [mesesGrafico]);

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

  // Ranking por setores
  const rankingSetores = useMemo(() => {
    const celulasPorSetor = new Map<string, Set<string>>();
    const entreguesPorSetor = new Map<string, number>();

    // Identifica a igreja do usuário logado
    const igrejaIdLogada = (
      usuarioLogado?.igreja_id ||
      usuarioLogado?.churchId ||
      IGREJA_ID_PADRAO
    ).trim().toLowerCase();

    // Mapeamento de id do setor para nome
    const mapaSetoresPorId = new Map<string, string>();
    unidadesCadastradas.forEach((u) => {
      mapaSetoresPorId.set(u.id, u.nome);
    });

    // Identifica todos os IDs de unidades que possuem filhas
    const idsQueSaoPais = new Set(
      unidadesCadastradas
        .map((u) => u.pai_id)
        .filter((paiId): paiId is string => Boolean(paiId && String(paiId).trim()))
        .map((paiId) => String(paiId).trim().toLowerCase())
    );

    if (unidadesCadastradas.length > 0) {
      unidadesCadastradas.forEach((u) => {
        const isAtivo = u.ativo === true;
        const matchNivel =
          !u.nivel_tipo_id ||
          String(u.nivel_tipo_id).trim().toLowerCase() === NIVEL_TIPO_CELULA_ID.toLowerCase();
        const matchIgreja =
          !u.igreja_id ||
          String(u.igreja_id).trim().toLowerCase() === igrejaIdLogada;
        const idNorm = String(u.id).trim().toLowerCase();
        const ehMaisBaixa = !idsQueSaoPais.has(idNorm);

        if (isAtivo && matchNivel && matchIgreja && ehMaisBaixa && u.pai_id) {
          const nomeSetor = (mapaSetoresPorId.get(u.pai_id) || 'Safira').trim();
          if (!celulasPorSetor.has(nomeSetor)) celulasPorSetor.set(nomeSetor, new Set());
          celulasPorSetor.get(nomeSetor)!.add(u.nome);
        }
      });
    }

    lancamentos.forEach((l) => {
      const setor = (l.Setor || l.setor || 'Safira').trim();
      const celula = (l.Célula || l.celulaNome || '').trim();
      if (celula && unidadesCadastradas.length === 0) {
        if (!celulasPorSetor.has(setor)) celulasPorSetor.set(setor, new Set());
        celulasPorSetor.get(setor)!.add(celula);
      }

      if (l.TESOURARIA_RECEB === true) {
        const matchAno = isTodosAnos || Number(l.ano) === Number(anoSelecionado);
        const matchMes = isTodosMeses || Number(l.mes) === Number(numMesSelecionado);
        if (matchAno && matchMes) {
          entreguesPorSetor.set(setor, (entreguesPorSetor.get(setor) || 0) + 1);
        }
      }
    });

    const todosSetores = new Set<string>([
      ...Array.from(celulasPorSetor.keys()),
      ...Array.from(entreguesPorSetor.keys()),
    ]);

    if (todosSetores.size === 0) {
      ['Safira', 'Fire', 'White', 'Black', 'Azul', 'Amarelo', 'Legacy', 'Onix', 'Diamante', 'Titanium'].forEach((s) =>
        todosSetores.add(s)
      );
    }

    const lista = Array.from(todosSetores).map((nome) => {
      const ativas = (celulasPorSetor.get(nome) || new Set()).size || 0;
      const unidadesDoSetor = unidadesMaisBaixas.filter((u) => {
        const nomeSetor = (mapaSetoresPorId.get(u.pai_id || '') || '').trim();
        return nomeSetor.toLowerCase() === nome.toLowerCase();
      });

      let previstos = 0;
      if (unidadesDoSetor.length > 0) {
        if (isTodosMeses) {
          const anos = isTodosAnos ? anosDisponiveis : [Number(anoSelecionado) || new Date().getFullYear()];
          for (const anoItem of anos) {
            const anoNum = Number(anoItem) || new Date().getFullYear();
            const maxMes = anoNum === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;
            for (let m = 1; m <= maxMes; m++) {
              previstos += calcularEncontrosPrevistosMes(anoNum, m, unidadesDoSetor);
            }
          }
        } else {
          const anoEfetivo = Number(anoSelecionado) || new Date().getFullYear();
          const mesEfetivo = numMesSelecionado > 0 ? numMesSelecionado : new Date().getMonth() + 1;
          if (isTodosAnos) {
            for (const anoItem of anosDisponiveis) {
              previstos += calcularEncontrosPrevistosMes(Number(anoItem), mesEfetivo, unidadesDoSetor);
            }
          } else {
            previstos = calcularEncontrosPrevistosMes(anoEfetivo, mesEfetivo, unidadesDoSetor);
          }
        }
      } else {
        previstos = ativas * 4 * fatorMeses;
      }

      const entregues = entreguesPorSetor.get(nome) || 0;
      let perc = 0;
      if (previstos > 0 && entregues > 0) {
        perc = Math.min(100, Math.round((entregues / previstos) * 100));
      }
      return { nome, ativas, previstos, entregues, perc };
    });

    lista.sort((a, b) => b.perc - a.perc || b.entregues - a.entregues);
    return lista;
  }, [
    unidadesCadastradas,
    unidadesMaisBaixas,
    usuarioLogado,
    lancamentos,
    isTodosAnos,
    anoSelecionado,
    isTodosMeses,
    numMesSelecionado,
    fatorMeses,
    anosDisponiveis,
  ]);

  const totalLancadosMes = lancamentosTodosMesAtual.length;
  const totalValidadosMes = lancamentosMesAtual.length;
  const percPrevistosMes =
    relatoriosPrevistos > 0 ? Math.min(100, Math.round((totalLancadosMes / relatoriosPrevistos) * 100)) : 0;
  const percValidadosMes =
    relatoriosPrevistos > 0 ? Math.min(100, Math.round((totalValidadosMes / relatoriosPrevistos) * 100)) : 0;

  const corPrevistosMes = getCorPercentual(percPrevistosMes);
  const corValidadosMes = getCorPercentual(percValidadosMes);

  return (
    <div className="p-3.5 sm:p-6 space-y-4 sm:space-y-6 max-w-[1600px] mx-auto text-slate-100">
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
                {mesesGrafico.map((m) => {
                  const altPix = maxOferta > 0 ? (m.pix / maxOferta) * 100 : 0;
                  const altEsp = maxOferta > 0 ? (m.esp / maxOferta) * 100 : 0;
                  const temMovimento = m.total > 0;
                  const valPixStr = formatarValorColuna(m.pix, temMovimento);
                  const valEspStr = formatarValorColuna(m.esp, temMovimento);
                  return (
                    <div
                      key={m.nome}
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
                  % de relatórios validados pela Tesouraria em relação à meta prevista
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
                {mesesGrafico.map((m) => {
                  const isRed = m.perc < 80 && m.perc > 0;
                  const barColor = isRed ? 'bg-[#c85a5a]' : 'bg-[#22c55e]';
                  return (
                    <div key={m.nome} className="flex flex-col items-center h-full justify-end">
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
                  ({mesSelecionado}/{anoSelecionado})
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
                    <span className={`font-bold text-sm shrink-0 pl-2 font-mono ${cor.text}`}>
                      {s.perc}%
                    </span>
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
