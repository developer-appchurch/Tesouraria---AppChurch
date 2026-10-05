'use client';

import React, { useState, useMemo } from 'react';
import {
  Calendar,
  CheckCircle,
  CheckCircle2,
  Clock,
  Copy,
  X,
  AlertTriangle,
  Trash2,
  Loader2,
} from 'lucide-react';
import { LancamentoTesouraria } from '@/lib/types';
import { formatBRL, formatDateBR } from '@/lib/utils';
import { TreasuryService } from '@/lib/treasury-service';

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
  lancamentos,
  anoSelecionado,
  mesSelecionado = '9',
  setorSelecionado = 'todos',
  onRefresh,
  onShowToast,
}) => {
  const [modalDuplicadosAberto, setModalDuplicadosAberto] = useState<boolean>(false);
  const [relatorioParaExcluir, setRelatorioParaExcluir] = useState<LancamentoTesouraria | null>(null);
  const [isExcluindo, setIsExcluindo] = useState<boolean>(false);

  const isTodosSetores =
    !setorSelecionado ||
    setorSelecionado.toLowerCase() === 'todos' ||
    setorSelecionado.toLowerCase() === 'todos os setores';

  // Extrair células exclusivamente dos lançamentos reais do banco de dados
  const celulasDoSetor = useMemo(() => {
    const celulasMap = new Map<string, { id: string; nome: string; lider: string; setor: string }>();

    lancamentos.forEach((l) => {
      const nome = (l.Célula || l.celulaNome || '').trim();
      const setor = (l.Setor || l.setor || 'Safira').trim();
      if (!nome) return;

      if (!isTodosSetores && setor.toLowerCase() !== (setorSelecionado || '').toLowerCase()) {
        return;
      }

      const key = `${setor}___${nome}`;
      if (!celulasMap.has(key)) {
        celulasMap.set(key, {
          id: l.id || key,
          nome,
          lider: l.LiderCelula || l.liderCelula || '-',
          setor,
        });
      }
    });

    return Array.from(celulasMap.values()).sort((a, b) => {
      if (isTodosSetores) {
        const cmpSetor = a.setor.localeCompare(b.setor);
        if (cmpSetor !== 0) return cmpSetor;
      }
      return a.nome.localeCompare(b.nome);
    });
  }, [lancamentos, setorSelecionado, isTodosSetores]);

  // Resumo SKUs: Validados vs Pendentes
  const resumoSKUs = useMemo(() => {
    const lancsFiltrados = lancamentos.filter((l) => {
      const matchSetor =
        isTodosSetores ||
        (l.Setor || l.setor || '').trim().toLowerCase() === (setorSelecionado || '').trim().toLowerCase();
      const matchAno =
        !anoSelecionado ||
        String(anoSelecionado) === 'todos' ||
        Number(l.ano) === Number(anoSelecionado);
      const matchMes = mesSelecionado === 'todos' || Number(l.mes) === Number(mesSelecionado);
      return matchSetor && matchAno && matchMes;
    });

    const validados = lancsFiltrados.filter((l) => l.TESOURARIA_RECEB === true);
    const pendentes = lancsFiltrados.filter((l) => l.TESOURARIA_RECEB !== true);

    return {
      qtdValidados: validados.length,
      qtdPendentes: pendentes.length,
      totalLancados: lancsFiltrados.length,
    };
  }, [lancamentos, setorSelecionado, isTodosSetores, anoSelecionado, mesSelecionado]);

  // 5 semanas do mês baseadas no último sábado do mês
  const semanas = useMemo(() => {
    const ano = typeof anoSelecionado === 'number' && anoSelecionado > 2000 ? anoSelecionado : 2026;
    const mesNum = mesSelecionado && mesSelecionado !== 'todos' ? parseInt(mesSelecionado, 10) : 9;

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

  // Detecção de relatórios duplicados
  const duplicadosInfo = useMemo(() => {
    const mesNumFiltro = mesSelecionado && mesSelecionado !== 'todos' ? Number(mesSelecionado) : null;
    const anoNumFiltro = anoSelecionado && String(anoSelecionado) !== 'todos' ? Number(anoSelecionado) : 2026;
    const numerosSemanasTela = new Set(semanas.map((s) => s.num));

    const lancsFiltrados = lancamentos.filter((l) => {
      const matchSetor =
        isTodosSetores ||
        (l.Setor || l.setor || '').trim().toLowerCase() === (setorSelecionado || '').trim().toLowerCase();
      if (!matchSetor) return false;

      const lancAno = l.ano;
      if (lancAno && lancAno !== anoNumFiltro) return false;

      if (mesNumFiltro !== null) {
        const lancMes = l.mes;
        const semNumLanc = l.semanaNumero ?? l.NumSemana;
        const bateComSemanaDaTela = typeof semNumLanc === 'number' && numerosSemanasTela.has(semNumLanc);
        if (lancMes && lancMes !== mesNumFiltro && !bateComSemanaDaTela) {
          return false;
        }
      }
      return true;
    });

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

    semanas.forEach((semInfo) => {
      const relsPorCelula: Record<
        string,
        { celNome: string; setorNome: string; rels: LancamentoTesouraria[] }
      > = {};

      lancsFiltrados.forEach((l) => {
        const celNome = (l.Célula || l.celulaNome || '').trim();
        const setorNome = (l.Setor || l.setor || 'Safira').trim();
        if (!celNome) return;

        let semNumLanc = typeof l.semanaNumero === 'number' ? l.semanaNumero : null;
        if (semNumLanc === null && typeof l.NumSemana === 'number') semNumLanc = l.NumSemana;

        let pertenceASemana = false;
        if (semNumLanc !== null && semNumLanc === semInfo.num) {
          pertenceASemana = true;
        }
        if (!pertenceASemana) {
          if (l.dataBR === semInfo.data || l.data === semInfo.dataIso) {
            pertenceASemana = true;
          }
        }

        if (pertenceASemana) {
          const chaveNorm = `${setorNome.toLowerCase()}___${celNome.toLowerCase()}`;
          if (!relsPorCelula[chaveNorm]) {
            relsPorCelula[chaveNorm] = { celNome, setorNome, rels: [] };
          }
          relsPorCelula[chaveNorm].rels.push(l);
        }
      });

      Object.entries(relsPorCelula).forEach(([, entry]) => {
        if (entry.rels.length > 1) {
          grupos.push({
            chave: `${semInfo.num}-${entry.setorNome}-${entry.celNome}`,
            semanaNum: semInfo.num,
            semanaData: semInfo.data,
            celulaNome: entry.celNome,
            setorNome: entry.setorNome,
            relatorios: entry.rels,
            qtdDuplicados: entry.rels.length - 1,
          });
          totalRelatoriosDuplicados += entry.rels.length - 1;
        }
      });
    });

    return {
      totalDuplicados: totalRelatoriosDuplicados,
      grupos,
    };
  }, [lancamentos, setorSelecionado, isTodosSetores, anoSelecionado, mesSelecionado, semanas]);

  // Helper valores da célula por semana
  const getValores = (
    celulaNome: string,
    celulaSetor: string,
    semInfo: { num: number; data: string; dataIso: string; dataObj: Date }
  ) => {
    const lanc = lancamentos.find((l) => {
      const matchNome =
        (l.Célula || l.celulaNome || '').trim().toLowerCase() === celulaNome.trim().toLowerCase();
      if (!matchNome) return false;

      if (isTodosSetores && celulaSetor && celulaSetor !== 'Sem Setor') {
        const lancSetor = (l.Setor || l.setor || '').trim().toLowerCase();
        if (lancSetor && lancSetor !== celulaSetor.trim().toLowerCase()) {
          return false;
        }
      }

      if (l.dataBR === semInfo.data || l.data === semInfo.dataIso) {
        return true;
      }
      const sem = l.semanaNumero ?? l.NumSemana;
      if (sem === semInfo.num) {
        return true;
      }
      return false;
    });

    if (!lanc) {
      return { temDado: false, pix: null, dinheiro: null, validadoTesouraria: false, total: 0 };
    }

    const pix = lanc.valorPix ?? (lanc.ValorOferta ?? 0);
    const esp = lanc.valorEspecie ?? (lanc.OfertaEspecie ?? 0);
    const total = lanc.valorTotal ?? (lanc.Total ?? (pix + esp));

    return {
      temDado: true,
      pix,
      dinheiro: esp,
      total,
      validadoTesouraria: lanc.TESOURARIA_RECEB === true,
    };
  };

  const handleConfirmarExclusao = async () => {
    if (!relatorioParaExcluir) return;
    setIsExcluindo(true);
    try {
      await TreasuryService.excluirLancamento(relatorioParaExcluir.id);
      onShowToast(`Relatório ID #${relatorioParaExcluir.id} excluído com sucesso.`);
      setRelatorioParaExcluir(null);
      onRefresh();
    } catch (e: any) {
      alert(`Erro ao excluir: ${e?.message}`);
    } finally {
      setIsExcluindo(false);
    }
  };

  return (
    <div className="p-3.5 sm:p-6 space-y-4 sm:space-y-5 max-w-[1600px] mx-auto text-slate-100">
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
                            <p className="font-bold text-slate-900 text-[13px] leading-tight truncate max-w-[200px]">
                              {celula.nome}
                            </p>
                            {isTodosSetores && celula.setor && (
                              <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-[#1c2030] text-slate-200 border border-[#303752]">
                                {celula.setor}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-600 font-medium leading-tight mt-1 truncate max-w-[220px]">
                            Líder: <span className="text-slate-800 font-semibold">{celula.lider || '-'}</span>
                          </p>
                        </td>
                        <td className="py-1.5 px-2 text-center font-extrabold bg-[#1c2030] text-white text-[10px] tracking-wider border-b border-[#2e344e] border-r border-[#b0b8cc] h-8">
                          PIX
                        </td>
                        {semanas.map((sem, sIdx) => {
                          const vals = getValores(celula.nome, celula.setor, sem);
                          const hasRelatorio = vals.temDado;
                          const isValidado = vals.validadoTesouraria;
                          const valorPix = vals.pix ?? 0;
                          return (
                            <td
                              key={`pix-${sem.data}-${sIdx}`}
                              className={`py-2 px-2 text-center border-r border-[#b0b8cc] last:border-r-0 border-b border-[#ccd2e0] h-8 transition-colors ${
                                isValidado ? 'bg-[#eef1f6]' : 'bg-[#fecdd3]/60'
                              }`}
                            >
                              {hasRelatorio ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <span
                                    className={`font-bold text-[11.5px] ${
                                      isValidado ? 'text-slate-900 font-mono' : 'text-rose-950 font-mono'
                                    }`}
                                  >
                                    {formatBRL(valorPix)}
                                  </span>
                                  {isValidado && (
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 inline shrink-0" />
                                  )}
                                </div>
                              ) : (
                                <span className="text-rose-400/70 text-[11px] font-mono select-none">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>

                      {/* Linha 2: ESPÉCIE */}
                      <tr className="bg-[#e4e7ed]">
                        <td className="py-1.5 px-2 text-center font-extrabold bg-[#1c2030] text-white text-[10px] tracking-wider border-r border-[#b0b8cc] h-8">
                          ESP
                        </td>
                        {semanas.map((sem, sIdx) => {
                          const vals = getValores(celula.nome, celula.setor, sem);
                          const hasRelatorio = vals.temDado;
                          const isValidado = vals.validadoTesouraria;
                          const valorEspecie = vals.dinheiro ?? 0;
                          return (
                            <td
                              key={`esp-${sem.data}-${sIdx}`}
                              className={`py-2 px-2 text-center border-r border-[#b0b8cc] last:border-r-0 h-8 transition-colors ${
                                isValidado ? 'bg-[#e4e7ed]' : 'bg-[#fecdd3]/60'
                              }`}
                            >
                              {hasRelatorio ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <span
                                    className={`font-bold text-[11.5px] ${
                                      isValidado ? 'text-slate-900 font-mono' : 'text-rose-950 font-mono'
                                    }`}
                                  >
                                    {formatBRL(valorEspecie)}
                                  </span>
                                  {isValidado && (
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 inline shrink-0" />
                                  )}
                                </div>
                              ) : (
                                <span className="text-rose-400/70 text-[11px] font-mono select-none">-</span>
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

      {/* Duplicate Reports Modal */}
      {modalDuplicadosAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn"
          onClick={() => setModalDuplicadosAberto(false)}
        >
          <div
            className="bg-[#1c2030] text-slate-100 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-rose-500/40 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-5 border-b border-slate-700/80 flex items-center justify-between bg-[#202538]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    Relatórios Duplicados {isTodosSetores ? 'em Todos os Setores' : `no Setor ${setorSelecionado}`}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {duplicadosInfo.totalDuplicados} relatórios excedentes detectados
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalDuplicadosAberto(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 scrollbar-thin">
              {duplicadosInfo.grupos.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">
                  Nenhum relatório duplicado encontrado para este período e setor.
                </div>
              ) : (
                duplicadosInfo.grupos.map((grupo, gIdx) => (
                  <div
                    key={`grupo-${grupo.chave}-${gIdx}`}
                    className="bg-[#242a3e] rounded-xl border border-rose-500/30 p-4 shadow-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-700/70">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white">{grupo.celulaNome}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            {grupo.relatorios.length} lançamentos ({grupo.qtdDuplicados} duplicado)
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Setor: <strong className="text-slate-200">{grupo.setorNome}</strong>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 bg-[#1c2030] px-3 py-1.5 rounded-lg border border-slate-700">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs font-semibold text-slate-200">
                          Semana {grupo.semanaNum}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">({grupo.semanaData})</span>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {grupo.relatorios.map((rel, rIdx) => {
                        const pix = rel.valorPix ?? (rel.ValorOferta ?? 0);
                        const esp = rel.valorEspecie ?? (rel.OfertaEspecie ?? 0);
                        const total = rel.valorTotal ?? (rel.Total ?? (pix + esp));
                        const lider = rel.LiderCelula || rel.liderCelula || '-';
                        const idRel = rel.id;
                        const isVal = rel.TESOURARIA_RECEB === true;
                        const dataRel = rel.dataBR || formatDateBR(rel.data);

                        return (
                          <div
                            key={`rel-${idRel}-${rIdx}`}
                            className="bg-[#1c2030] p-3 rounded-lg border border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-start sm:items-center gap-2.5">
                              <div className="w-6 h-6 rounded-full bg-slate-700/70 text-slate-300 flex items-center justify-center font-bold text-[10px] shrink-0">
                                {rIdx + 1}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-white font-mono bg-[#252b42] px-2 py-0.5 rounded text-[11px]">
                                    ID: {String(idRel)}
                                  </span>
                                  <span className="text-[11px] text-slate-300 font-mono">
                                    Data: {dataRel}
                                  </span>
                                  {isVal ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                      <CheckCircle className="w-3 h-3" /> Validado
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                      <Clock className="w-3 h-3" /> Pendente
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1">
                                  Líder: <span className="text-slate-200 font-medium">{lider}</span>
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                              <div className="text-left sm:text-right">
                                <div className="font-mono font-black text-slate-100 text-xs sm:text-sm">
                                  Total: {formatBRL(total)}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  PIX: {formatBRL(pix)} · Esp: {formatBRL(esp)}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setRelatorioParaExcluir(rel)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 hover:border-rose-600 transition-all font-semibold text-xs cursor-pointer shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Excluir</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Sub-modal confirm delete */}
            {relatorioParaExcluir && (
              <div
                className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
                onClick={() => !isExcluindo && setRelatorioParaExcluir(null)}
              >
                <div
                  className="bg-[#1c2030] text-slate-100 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-rose-500/50 space-y-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                      <Trash2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-white">Excluir Relatório Duplicado?</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Esta ação removerá este lançamento do Supabase.
                      </p>
                    </div>
                  </div>

                  <div className="bg-[#141724] p-3.5 rounded-xl border border-slate-700/80 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">ID:</span>
                      <span className="font-mono font-bold text-white">#{relatorioParaExcluir.id}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Célula:</span>
                      <span className="font-semibold text-slate-200">
                        {relatorioParaExcluir.Célula || relatorioParaExcluir.celulaNome}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Valor Total:</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {formatBRL(relatorioParaExcluir.valorTotal ?? relatorioParaExcluir.Total ?? 0)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      disabled={isExcluindo}
                      onClick={() => setRelatorioParaExcluir(null)}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={isExcluindo}
                      onClick={handleConfirmarExclusao}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50"
                    >
                      {isExcluindo ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Excluindo...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Sim, Excluir</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="p-4 border-t border-slate-700/80 bg-[#202538] flex justify-end">
              <button
                onClick={() => setModalDuplicadosAberto(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
