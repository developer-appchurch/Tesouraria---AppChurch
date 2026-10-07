'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  X,
  AlertTriangle,
  Trash2,
  Loader2,
} from 'lucide-react';
import { LancamentoTesouraria, UnidadeCadastrada } from '@/lib/types';
import { formatBRL, formatDateBR } from '@/lib/utils';
import { TreasuryService, MAPA_CELULAS_SETORES, registrarLimpezaDeCache } from '@/lib/treasury-service';

let globalUnidadesCache: UnidadeCadastrada[] | null = null;
registrarLimpezaDeCache(() => {
  globalUnidadesCache = null;
});

interface RelacaoEnvelopesViewProps {
  lancamentos: LancamentoTesouraria[];
  anoSelecionado: number | string;
  onSelectAno: (ano: number | string) => void;
  mesSelecionado?: string;
  onSelectMes?: (mes: string) => void;
  setorSelecionado?: string;
  onSelectSetor?: (setor: string) => void;
  onRefresh: () => void;
  onShowToast: (msg: string) => void;
}

export const RelacaoEnvelopesView: React.FC<RelacaoEnvelopesViewProps> = ({
  lancamentos = [],
  anoSelecionado,
  mesSelecionado = '10',
  setorSelecionado = 'Safira',
  onRefresh,
  onShowToast,
}) => {
  const [modalDuplicadosAberto, setModalDuplicadosAberto] = useState<boolean>(false);
  const [relatorioParaExcluir, setRelatorioParaExcluir] = useState<LancamentoTesouraria | null>(null);
  const [isExcluindo, setIsExcluindo] = useState<boolean>(false);
  const [isSkeletonLoading, setIsSkeletonLoading] = useState<boolean>(true);
  const [unidadesCadastradas, setUnidadesCadastradas] = useState<UnidadeCadastrada[]>(() => globalUnidadesCache || []);

  // Busca as unidades reais da igreja (id, nome, pai_id, ativo) uma vez ao abrir a tela.
  // O serviço guarda em cache; não depende de onRefresh para não repetir a busca a cada renderização.
  useEffect(() => {
    let isCancelled = false;
    const carregar = async () => {
      try {
        const data = await TreasuryService.fetchUnidadesCadastradas();
        // Sempre substitui (mesmo vazio): nunca manter unidades de outra sessão
        if (!isCancelled && data) {
          globalUnidadesCache = data;
          setUnidadesCadastradas(data);
        }
      } catch (err) {
        console.warn('Erro ao carregar unidades cadastradas:', err);
      }
    };
    carregar();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Efeito de Skeleton suave na inicialização
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsSkeletonLoading(false);
    }, 120);
    return () => clearTimeout(timer);
  }, []);

  const isTodosSetores =
    !setorSelecionado ||
    setorSelecionado.toLowerCase() === 'todos' ||
    setorSelecionado.toLowerCase() === 'todos os setores';

  const anoNumFiltro =
    anoSelecionado && String(anoSelecionado).toLowerCase() !== 'todos'
      ? Number(anoSelecionado)
      : null;
  const mesNumFiltro =
    mesSelecionado && mesSelecionado !== 'todos'
      ? Number(mesSelecionado)
      : null;

  // 1. Extrair APENAS as unidades cujo pai_id(setor) seja o setor selecionado e ativo = true
  const celulasDoSetor = useMemo(() => {
    const setorAlvo = (setorSelecionado || 'Safira').trim().toLowerCase();

    // Mapeamento de id do setor para nome do setor
    const mapaSetoresPorId = new Map<string, string>();
    unidadesCadastradas.forEach((u) => {
      mapaSetoresPorId.set(u.id, u.nome);
    });

    // Encontra a unidade que representa o setor selecionado (ex: unidade com nome "Safira")
    const setorUnit = unidadesCadastradas.find(
      (u) => u.nome.trim().toLowerCase() === setorAlvo
    );

    // Filtra as unidades do banco:
    // Deve ter como pai_id o ID do setor selecionado na parte de cima, e com ativo === true
    let unidadesFiltradas: UnidadeCadastrada[] = [];

    if (isTodosSetores) {
      // Se "Todos os Setores", exibe todas as células ativas que possuem um pai_id (setor)
      unidadesFiltradas = unidadesCadastradas.filter(
        (u) => Boolean(u.pai_id) && u.ativo === true
      );
    } else if (setorUnit) {
      unidadesFiltradas = unidadesCadastradas.filter(
        (u) => u.pai_id === setorUnit.id && u.ativo === true
      );
    } else {
      // Fallback: se setorUnit não for encontrado pelo nome exato, verifica se algum pai_id tem o nome do setor
      unidadesFiltradas = unidadesCadastradas.filter((u) => {
        if (!u.pai_id || u.ativo !== true) return false;
        const nomePai = mapaSetoresPorId.get(u.pai_id);
        return Boolean(nomePai && nomePai.trim().toLowerCase() === setorAlvo);
      });
    }

    // Mapeia líderes dos lançamentos para preencher o nome do líder de cada unidade
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

    return unidadesFiltradas
      .map((u) => {
        const setorNome = (u.pai_id && mapaSetoresPorId.get(u.pai_id)) || setorUnit?.nome || setorSelecionado || 'Safira';
        const lider =
          u.lider_nome ||
          (u.lideres && u.lideres.length > 0 ? u.lideres.join(', ') : null) ||
          lideresPorUnidade.get(u.id) ||
          lideresPorNome.get(u.nome.trim().toLowerCase()) ||
          '-';
        return {
          id: u.id,
          nome: u.nome,
          lider,
          lideres: u.lideres || [],
          setor: setorNome,
          ativo: u.ativo,
        };
      })
      .sort((a, b) => {
        if (isTodosSetores) {
          const cmpSetor = a.setor.localeCompare(b.setor);
          if (cmpSetor !== 0) return cmpSetor;
        }
        return a.nome.localeCompare(b.nome);
      });
  }, [unidadesCadastradas, setorSelecionado, isTodosSetores, lancamentos]);

  // 2. 5 semanas do mês baseadas no último sábado do mês
  const semanas = useMemo(() => {
    const ano = typeof anoSelecionado === 'number' && anoSelecionado > 2000 ? anoSelecionado : new Date().getFullYear();
    const mesNum = mesSelecionado && mesSelecionado !== 'todos' ? parseInt(mesSelecionado, 10) : new Date().getMonth() + 1;

    const ultimoDiaDoMes = new Date(ano, mesNum, 0);
    const diaSemanaUltimoDia = ultimoDiaDoMes.getDay();
    const diasParaSubtrair = (diaSemanaUltimoDia - 6 + 7) % 7;
    const dataUltimoSabado = new Date(ano, mesNum - 1, ultimoDiaDoMes.getDate() - diasParaSubtrair);

    const getWeekNumber = (d: Date): number => {
      const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNr = (target.getUTCDay() + 6) % 7;
      target.setUTCDate(target.getUTCDate() - dayNr + 3);
      const firstThursday = target.getTime();
      target.setUTCMonth(0, 1);
      if (target.getUTCDay() !== 4) {
        target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
      }
      return 1 + Math.ceil((firstThursday - target.getTime()) / 604800000);
    };

    const listaSemanas = [];
    for (let step = 4; step >= 0; step--) {
      const d = new Date(dataUltimoSabado);
      d.setDate(d.getDate() - step * 7);
      const diaStr = String(d.getDate()).padStart(2, '0');
      const mesStr = String(d.getMonth() + 1).padStart(2, '0');
      const anoStr = String(d.getFullYear());
      const dataFormatada = `${diaStr}/${mesStr}/${anoStr}`;
      const dataIso = `${anoStr}-${mesStr}-${diaStr}`;
      const numSemana = getWeekNumber(d);
      listaSemanas.push({
        num: numSemana,
        data: dataFormatada,
        dataIso,
        dataObj: d,
      });
    }
    return listaSemanas;
  }, [anoSelecionado, mesSelecionado]);

  // 3. MAPA DE INDEXAÇÃO O(1) PARA BUSCA ULTRA RÁPIDA DE VALORES POR CÉLULA E SEMANA
  const lancamentosPorCelulaESemana = useMemo(() => {
    const map = new Map<
      string,
      {
        pix: number;
        dinheiro: number;
        total: number;
        validadoTesouraria: boolean;
        relatorios: LancamentoTesouraria[];
      }
    >();

    const setorAlvo = (setorSelecionado || 'Safira').trim().toLowerCase();

    // Helper para verificar se a data está na janela de 7 dias daquela semana (terminando no sábado)
    const isDateInWeekWindow = (dateIso: string, saturday: Date): boolean => {
      if (!dateIso) return false;
      try {
        const clean = dateIso.includes('T') ? dateIso.split('T')[0] : dateIso;
        const parts = clean.split('-');
        if (parts.length !== 3) return false;
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
        if (isNaN(d.getTime())) return false;

        const satEnd = new Date(saturday.getFullYear(), saturday.getMonth(), saturday.getDate(), 23, 59, 59);
        const sunStart = new Date(saturday.getFullYear(), saturday.getMonth(), saturday.getDate() - 6, 0, 0, 0);
        return d >= sunStart && d <= satEnd;
      } catch {
        return false;
      }
    };

    for (let i = 0; i < lancamentos.length; i++) {
      const l = lancamentos[i];
      const celNome = (l.Célula || l.celulaNome || '').trim().toLowerCase();
      if (!celNome) continue;

      let setorNome = (l.Setor || l.setor || '').trim().toLowerCase();
      if (!setorNome) {
        setorNome = (MAPA_CELULAS_SETORES[celNome] || 'safira').toLowerCase();
      }

      // Filtro de setor
      if (!isTodosSetores && setorNome !== setorAlvo) {
        continue;
      }

      // Filtro de ano
      const lAno = l.ano || (l.data ? new Date(l.data).getFullYear() : null);
      if (anoNumFiltro !== null && lAno && lAno !== anoNumFiltro) {
        continue;
      }

      // Filtro de mês
      const lMes = l.mes || (l.data ? new Date(l.data).getMonth() + 1 : null);
      if (mesNumFiltro !== null && lMes && lMes !== mesNumFiltro) {
        // Se o mês for diferente, mas a semana cair no mês selecionado, checa nas semanas
        const semNumLanc = typeof l.semanaNumero === 'number' ? l.semanaNumero : l.NumSemana;
        const semanaNaTela = semanas.some((s) => s.num === semNumLanc || (l.data && isDateInWeekWindow(l.data, s.dataObj)));
        if (!semanaNaTela) continue;
      }

      const semNumLanc = typeof l.semanaNumero === 'number' ? l.semanaNumero : l.NumSemana;

      // Encontrar a semana correspondente na tela
      let matchedSemana: (typeof semanas)[0] | undefined = undefined;
      for (const sem of semanas) {
        if (typeof semNumLanc === 'number' && semNumLanc === sem.num) {
          matchedSemana = sem;
          break;
        }
        if (l.dataBR === sem.data || l.data === sem.dataIso) {
          matchedSemana = sem;
          break;
        }
        if (l.data && isDateInWeekWindow(l.data, sem.dataObj)) {
          matchedSemana = sem;
          break;
        }
      }

      if (!matchedSemana) continue;

      const pix = Number(l.valorPix ?? (l.ValorOferta ?? 0));
      const esp = Number(l.valorEspecie ?? (l.OfertaEspecie ?? 0));
      const tot = Number(l.valorTotal ?? (l.Total ?? (pix + esp)));
      const isValidado = l.TESOURARIA_RECEB === true;

      const keysToAdd = [
        `${celNome}___sem_${matchedSemana.num}`,
        `${setorNome}___${celNome}___sem_${matchedSemana.num}`,
      ];

      if (l.unidade_id) {
        keysToAdd.push(`u_${l.unidade_id}___sem_${matchedSemana.num}`);
      }

      for (const k of keysToAdd) {
        const existing = map.get(k);
        if (existing) {
          existing.pix += pix;
          existing.dinheiro += esp;
          existing.total += tot;
          existing.validadoTesouraria = existing.validadoTesouraria && isValidado;
          existing.relatorios.push(l);
        } else {
          map.set(k, {
            pix,
            dinheiro: esp,
            total: tot,
            validadoTesouraria: isValidado,
            relatorios: [l],
          });
        }
      }
    }

    return map;
  }, [lancamentos, semanas, anoNumFiltro, mesNumFiltro, setorSelecionado, isTodosSetores]);

  // 4. Helper O(1) para obter valores da célula
  const getValores = useCallback(
    (
      celulaId: string,
      celulaNome: string,
      celulaSetor: string,
      semInfo: { num: number; data: string; dataIso: string; dataObj: Date }
    ) => {
      const cNorm = celulaNome.trim().toLowerCase();
      const sNorm = (celulaSetor || '').trim().toLowerCase();

      const data =
        (celulaId ? lancamentosPorCelulaESemana.get(`u_${celulaId}___sem_${semInfo.num}`) : undefined) ||
        lancamentosPorCelulaESemana.get(`${sNorm}___${cNorm}___sem_${semInfo.num}`) ||
        lancamentosPorCelulaESemana.get(`${cNorm}___sem_${semInfo.num}`);

      if (!data) {
        return { temDado: false, pix: null, dinheiro: null, validadoTesouraria: false, total: 0 };
      }

      return {
        temDado: true,
        pix: data.pix,
        dinheiro: data.dinheiro,
        total: data.total,
        validadoTesouraria: data.validadoTesouraria,
      };
    },
    [lancamentosPorCelulaESemana]
  );

  // 5. Resumo SKUs: Validados vs Pendentes sincronizado 100% com o que está visível na tabela
  // Considera estritamente as células ativas do setor exibidas e as semanas da tabela
  const resumoSKUs = useMemo(() => {
    let qtdValidados = 0;
    let qtdPendentes = 0;
    let totalLancados = 0;

    for (const celula of celulasDoSetor) {
      for (const sem of semanas) {
        const val = getValores(celula.id, celula.nome, celula.setor, sem);
        if (val.temDado) {
          totalLancados++;
          if (val.validadoTesouraria) {
            qtdValidados++;
          } else {
            qtdPendentes++;
          }
        }
      }
    }

    return {
      qtdValidados,
      qtdPendentes,
      totalLancados,
    };
  }, [celulasDoSetor, semanas, getValores]);

  // 6. Detecção de relatórios duplicados em alta velocidade O(N)
  const duplicadosInfo = useMemo(() => {
    const numerosSemanasTela = new Set(semanas.map((s) => s.num));
    const relsPorSemanaECelula = new Map<string, LancamentoTesouraria[]>();
    const setorFiltro = (setorSelecionado || '').trim().toLowerCase();

    for (let i = 0; i < lancamentos.length; i++) {
      const l = lancamentos[i];
      let s = (l.Setor || l.setor || '').trim().toLowerCase();
      if (!s) {
        const c = (l.Célula || l.celulaNome || '').trim().toLowerCase();
        s = (MAPA_CELULAS_SETORES[c] || 'safira').toLowerCase();
      }

      if (!isTodosSetores && s !== setorFiltro) continue;
      if (anoNumFiltro !== null && l.ano && Number(l.ano) !== anoNumFiltro) continue;

      const semNumLanc = l.semanaNumero ?? l.NumSemana;
      const bateComSemanaDaTela = typeof semNumLanc === 'number' && numerosSemanasTela.has(semNumLanc);
      if (mesNumFiltro !== null && l.mes && Number(l.mes) !== mesNumFiltro && !bateComSemanaDaTela) {
        continue;
      }

      const celNome = (l.Célula || l.celulaNome || '').trim();
      const setorNome = (l.Setor || l.setor || 'Safira').trim();
      if (!celNome) continue;

      semanas.forEach((semInfo) => {
        let match = false;
        if (typeof semNumLanc === 'number' && semNumLanc === semInfo.num) match = true;
        if (!match && (l.dataBR === semInfo.data || l.data === semInfo.dataIso)) match = true;

        if (match) {
          const key = `${semInfo.num}___${setorNome}___${celNome}`;
          const arr = relsPorSemanaECelula.get(key) || [];
          arr.push(l);
          relsPorSemanaECelula.set(key, arr);
        }
      });
    }

    interface GrupoDuplicado {
      chave: string;
      semanaNum: number;
      semanaData: string;
      celulaNome: string;
      setorNome: string;
      relatorios: LancamentoTesouraria[];
      qtdDuplicados: number;
    }

    const grupos: GrupoDuplicado[] = [];
    let totalRelatoriosDuplicados = 0;

    relsPorSemanaECelula.forEach((rels, key) => {
      if (rels.length > 1) {
        const parts = key.split('___');
        const semNum = Number(parts[0]);
        const setorNome = parts[1];
        const celNome = parts[2];
        const semFound = semanas.find((s) => s.num === semNum);

        grupos.push({
          chave: key,
          semanaNum: semNum,
          semanaData: semFound ? semFound.data : '',
          celulaNome: celNome,
          setorNome: setorNome,
          relatorios: rels,
          qtdDuplicados: rels.length - 1,
        });
        totalRelatoriosDuplicados += rels.length - 1;
      }
    });

    return {
      totalDuplicados: totalRelatoriosDuplicados,
      grupos,
    };
  }, [lancamentos, setorSelecionado, isTodosSetores, anoNumFiltro, mesNumFiltro, semanas]);

  const handleConfirmarExclusao = async () => {
    if (!relatorioParaExcluir) return;
    setIsExcluindo(true);
    try {
      const res = await TreasuryService.excluirLancamento(relatorioParaExcluir.id);
      if (!res.success) {
        onShowToast(`Erro ao excluir: ${res.error || 'falha no servidor'}`);
        return;
      }
      onShowToast(`Relatório ID #${relatorioParaExcluir.id} excluído com sucesso.`);
      setRelatorioParaExcluir(null);
      onRefresh();
    } catch (e: any) {
      onShowToast(`Erro ao excluir: ${e?.message}`);
    } finally {
      setIsExcluindo(false);
    }
  };

  return (
    <div className="p-3.5 sm:p-6 space-y-4 sm:space-y-5 max-w-[1600px] mx-auto text-slate-100">
      {/* SKELETON SCREEN COM CARDS EM DESFOQUE (BLUR) */}
      {isSkeletonLoading ? (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* 1. Skeleton Top Cards em Desfoque */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
            {[1, 2, 3].map((idx) => (
              <div
                key={`card-skel-${idx}`}
                className="bg-[#202538]/80 backdrop-blur-md p-4 rounded-xl border border-[#2d3450] flex items-center justify-between gap-3 shadow-md animate-pulse"
              >
                <div className="space-y-2 flex-1 blur-[1.5px]">
                  <div className="h-3.5 bg-slate-700/70 rounded-md w-28"></div>
                  <div className="h-7 bg-slate-600/80 rounded-md w-20"></div>
                  <div className="h-2.5 bg-slate-700/50 rounded-md w-44"></div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-slate-700/40 shrink-0 blur-[1px]"></div>
              </div>
            ))}
          </div>

          {/* 2. Skeleton Tabela em Desfoque */}
          <div className="bg-[#1c2030]/90 backdrop-blur-md rounded-xl p-4 border border-[#2d3450] shadow-md space-y-3 animate-pulse">
            <div className="h-10 bg-[#252b41] rounded-lg w-full blur-[1px]"></div>
            {[1, 2, 3, 4, 5, 6].map((rIdx) => (
              <div key={`row-skel-${rIdx}`} className="h-14 bg-[#23293e]/60 rounded-lg w-full flex items-center gap-3 px-3 blur-[2px]">
                <div className="w-48 h-5 bg-slate-700/60 rounded"></div>
                <div className="w-20 h-5 bg-slate-700/40 rounded"></div>
                <div className="flex-1 grid grid-cols-5 gap-2">
                  <div className="h-7 bg-slate-700/50 rounded"></div>
                  <div className="h-7 bg-slate-700/50 rounded"></div>
                  <div className="h-7 bg-slate-700/50 rounded"></div>
                  <div className="h-7 bg-slate-700/50 rounded"></div>
                  <div className="h-7 bg-slate-700/50 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* 1. Top SKU Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
            {/* Card 1: Envelopes Validados */}
            <div className="bg-[#202538] p-4 rounded-xl border border-emerald-500/30 flex items-center justify-between gap-3 shadow-md">
              <div className="min-w-0 flex-1">
                <span className="text-slate-400 text-xs font-medium block truncate">Envelopes Validados</span>
                <div className="flex flex-wrap items-baseline gap-1.5 mt-1">
                  <span className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                    {resumoSKUs.qtdValidados}
                  </span>
                  <span className="text-xs font-medium text-slate-400">
                    de {resumoSKUs.totalLancados} relatórios
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Recebidos e confirmados pela tesouraria
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
            </div>

            {/* Card 2: Envelopes Pendentes */}
            <div className="bg-[#202538] p-4 rounded-xl border border-amber-500/30 flex items-center justify-between gap-3 shadow-md">
              <div className="min-w-0 flex-1">
                <span className="text-slate-400 text-xs font-medium block truncate">Envelopes Pendentes</span>
                <div className="flex flex-wrap items-baseline gap-1.5 mt-1">
                  <span className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                    {resumoSKUs.qtdPendentes}
                  </span>
                  <span className="text-xs font-medium text-slate-400">aguardando validação</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Lançados, aguardando validação na tesouraria
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
            </div>

            {/* Card 3: Relatório Duplicado */}
            <div
              onClick={() => {
                if (duplicadosInfo.totalDuplicados > 0) {
                  setModalDuplicadosAberto(true);
                }
              }}
              className={`p-4 rounded-xl border flex items-center justify-between gap-3 shadow-md transition-all ${
                duplicadosInfo.totalDuplicados > 0
                  ? 'bg-[#202538] border-rose-500/50 hover:border-rose-500 hover:bg-[#252b41] cursor-pointer ring-1 ring-rose-500/20 active:scale-[0.99]'
                  : 'bg-[#202538] border-slate-700/60 opacity-90'
              }`}
              title={
                duplicadosInfo.totalDuplicados > 0
                  ? 'Clique para ver detalhes dos relatórios duplicados'
                  : 'Nenhum relatório duplicado encontrado'
              }
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 text-xs font-medium block truncate">Relatório Duplicado</span>
                  {duplicadosInfo.totalDuplicados > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      Atenção
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-baseline gap-1.5 mt-1">
                  <span
                    className={`text-2xl sm:text-3xl font-black font-mono ${
                      duplicadosInfo.totalDuplicados > 0 ? 'text-rose-400' : 'text-slate-300'
                    }`}
                  >
                    {duplicadosInfo.totalDuplicados}
                  </span>
                  <span className="text-xs font-medium text-slate-400">
                    {duplicadosInfo.totalDuplicados === 1 ? 'duplicado detectado' : 'duplicados detectados'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {duplicadosInfo.totalDuplicados > 0
                    ? 'Mesma célula com múltiplos relatórios na semana'
                    : 'Nenhum relatório duplicado nas semanas deste mês'}
                </p>
              </div>
              <div
                className={`p-2.5 rounded-xl border shrink-0 ${
                  duplicadosInfo.totalDuplicados > 0
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    : 'bg-slate-700/20 text-slate-400 border-slate-700/30'
                }`}
              >
                <Copy className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
            </div>
          </div>

          {/* 2. Main 5-Week Grid Table */}
          <div className="bg-[#e4e7ed] text-slate-900 rounded-xl shadow-md overflow-hidden border border-[#c5cbda]">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-xs border-collapse min-w-[760px]">
                <thead>
                  <tr className="bg-[#1c2030] text-white">
                    <th className="py-3 px-4 text-left font-bold text-sm w-64 border-r border-[#2f354e]">
                      Célula / Líder
                    </th>
                    <th className="py-3 px-2 text-center font-bold w-24 border-r border-[#2f354e]">
                      Oferta
                    </th>
                    {semanas.map((sem, sIdx) => (
                      <th
                        key={`header-sem-${sem.data}-${sIdx}`}
                        className="py-2.5 px-3 text-center border-r border-[#2f354e] last:border-r-0 min-w-[130px]"
                      >
                        <div className="text-[11px] font-semibold text-slate-200">Semana {sem.num}</div>
                        <div className="mt-1 flex items-center justify-center gap-1 bg-[#252b41] py-0.5 px-2 rounded text-[11px] font-mono text-slate-300 border border-[#3a4364]">
                          <span>{sem.data}</span>
                          <Calendar className="w-3 h-3 text-slate-400 inline shrink-0" />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {celulasDoSetor.length === 0 ? (
                    <tr>
                      <td colSpan={2 + semanas.length} className="py-12 text-center text-slate-600 font-medium">
                        Nenhum relatório encontrado para o setor selecionado no Supabase.
                      </td>
                    </tr>
                  ) : (
                    celulasDoSetor.map((celula) => {
                      return (
                        <React.Fragment key={celula.id}>
                          {/* Linha 1: PIX */}
                          <tr className="border-t-2 border-[#b0b8cc]">
                            <td
                              rowSpan={2}
                              className="py-2.5 px-3.5 font-bold text-xs text-slate-900 align-middle bg-[#f3f5f9] border-r border-[#b0b8cc]"
                            >
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p
                                  className="font-bold text-slate-900 text-[13px] leading-tight truncate max-w-[240px]"
                                  title={celula.nome}
                                >
                                  {celula.nome}
                                </p>
                                {isTodosSetores && celula.setor && (
                                  <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-[#1c2030] text-slate-200 border border-[#303752]">
                                    {celula.setor}
                                  </span>
                                )}
                              </div>
                              <p
                                className="text-[11px] text-slate-600 font-medium mt-0.5 truncate max-w-[240px]"
                                title={`Líder${celula.lider && celula.lider.includes(',') ? 'es' : ''}: ${celula.lider}`}
                              >
                                Líder{celula.lider && celula.lider.includes(',') ? 'es' : ''}: {celula.lider}
                              </p>
                            </td>
                            <td className="py-2 px-2.5 text-center font-bold text-[11px] text-slate-800 border-r border-[#cbd2e0] bg-[#eaedf4]">
                              PIX
                            </td>
                            {semanas.map((sem, sIdx) => {
                              const val = getValores(celula.id, celula.nome, celula.setor, sem);
                              const isValidado = val.validadoTesouraria;
                              const bgClass = isValidado ? 'bg-white' : 'bg-[#EDABAB]';
                              const temRelatorio = val.temDado;
                              const valorPix = val.pix ?? 0;

                              return (
                                <td
                                  key={`pix-${celula.id}-${sem.data}-${sIdx}`}
                                  className={`py-2 px-2.5 text-right font-mono text-xs border-r border-[#cbd2e0] last:border-r-0 ${bgClass}`}
                                >
                                  {temRelatorio ? (
                                    <span className="inline-flex items-center justify-end gap-1 w-full">
                                      <span className="text-slate-900 font-semibold">{formatBRL(valorPix)}</span>
                                      {isValidado && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline-block shrink-0" />}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 font-medium">R$ 0,00</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>

                          {/* Linha 2: Espécie */}
                          <tr className="border-b-2 border-[#b0b8cc]">
                            <td className="py-2 px-2.5 text-center font-bold text-[11px] text-slate-800 border-r border-[#cbd2e0] bg-[#eaedf4]">
                              Espécie
                            </td>
                            {semanas.map((sem, sIdx) => {
                              const val = getValores(celula.id, celula.nome, celula.setor, sem);
                              const isValidado = val.validadoTesouraria;
                              const bgClass = isValidado ? 'bg-[#eaedf4]' : 'bg-[#EDABAB]';
                              const temRelatorio = val.temDado;
                              const valorEsp = val.dinheiro ?? 0;

                              return (
                                <td
                                  key={`esp-${celula.id}-${sem.data}-${sIdx}`}
                                  className={`py-2 px-2.5 text-right font-mono text-xs border-r border-[#cbd2e0] last:border-r-0 ${bgClass}`}
                                >
                                  {temRelatorio ? (
                                    <span className="inline-flex items-center justify-end gap-1 w-full">
                                      <span className="text-slate-900 font-semibold">{formatBRL(valorEsp)}</span>
                                      {isValidado && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline-block shrink-0" />}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 font-medium">R$ 0,00</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal de Relatórios Duplicados */}
      {modalDuplicadosAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[#1b1f33] border border-[#2d3450] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl text-slate-100 animate-in zoom-in-95 duration-150">
            {/* Header Modal */}
            <div className="p-4 sm:p-5 border-b border-[#2d3450] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Relatórios Duplicados na Mesma Semana</h3>
                  <p className="text-xs text-slate-400">
                    Total de <span className="text-rose-400 font-bold">{duplicadosInfo.totalDuplicados}</span> relatório(s) excedente(s)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalDuplicadosAberto(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#252a42] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista de Grupos Duplicados */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 scrollbar-thin">
              {duplicadosInfo.grupos.map((grupo) => (
                <div
                  key={grupo.chave}
                  className="bg-[#141726] border border-rose-500/30 rounded-xl p-3.5 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#252a42] pb-2">
                    <div>
                      <span className="font-extrabold text-white text-sm">{grupo.celulaNome}</span>
                      <span className="text-xs text-slate-400 ml-2">({grupo.setorNome})</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      Semana {grupo.semanaNum} ({grupo.semanaData})
                    </span>
                  </div>

                  <div className="space-y-2">
                    {grupo.relatorios.map((rel, rIdx) => (
                      <div
                        key={rel.id}
                        className="bg-[#1c2032] border border-[#2b324d] rounded-lg p-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-slate-200">
                            Relatório #{rIdx + 1} - {formatBRL(rel.valorTotal)}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span>PIX: {formatBRL(rel.valorPix)}</span>
                            <span>•</span>
                            <span>Espécie: {formatBRL(rel.valorEspecie)}</span>
                            <span>•</span>
                            <span className={rel.TESOURARIA_RECEB ? 'text-emerald-400' : 'text-amber-400'}>
                              {rel.TESOURARIA_RECEB ? 'Validado' : 'Pendente'}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => setRelatorioParaExcluir(rel)}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Excluir</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-[#2d3450] flex justify-end">
              <button
                onClick={() => setModalDuplicadosAberto(false)}
                className="px-4 py-2 rounded-lg bg-[#22283e] hover:bg-[#2c334d] text-slate-300 font-semibold text-xs cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {relatorioParaExcluir && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[#1b1f33] border border-rose-500/50 rounded-2xl w-full max-w-md p-6 shadow-2xl text-slate-100 animate-in zoom-in-95 duration-150 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Confirmar Exclusão de Relatório</h3>
              <p className="text-xs text-slate-400 mt-1">
                Deseja realmente excluir o relatório ID #{relatorioParaExcluir.id} da célula{' '}
                <strong className="text-white">{relatorioParaExcluir.Célula || relatorioParaExcluir.celulaNome}</strong>{' '}
                no valor de <strong className="text-emerald-400">{formatBRL(relatorioParaExcluir.valorTotal)}</strong>?
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setRelatorioParaExcluir(null)}
                className="px-4 py-2 rounded-lg bg-[#22283e] hover:bg-[#2c334d] text-slate-300 font-semibold text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarExclusao}
                disabled={isExcluindo}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
              >
                {isExcluindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>{isExcluindo ? 'Excluindo...' : 'Sim, Excluir'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
