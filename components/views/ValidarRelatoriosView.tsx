'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Edit,
  Check,
  Undo2,
  X,
  Search,
  Save,
  CheckSquare,
  Square,
  Loader2,
  ChevronDown,
  Lock,
} from 'lucide-react';
import { LancamentoTesouraria, MembroItem, PermissaoUsuario } from '@/lib/types';
import { formatBRL, formatDateBR } from '@/lib/utils';
import { TreasuryService } from '@/lib/treasury-service';
import { getSupabaseClient } from '@/lib/supabase';

interface RelatorioDetalhadoRPC {
  id: string;
  unidade_id?: string;
  celula_nome: string;
  lideres: string;
  data_relatorio: string;
  valor_pix: number;
  valor_especie: number;
  tesouraria_recebido: boolean;
  data_recebimento?: string | null;
  tesoureiro_id?: string | null;
  nome_tesoureiro?: string | null;
}

interface SetorPendenciaRPC {
  setor_id: string;
  setor_nome: string;
  qtd_pendentes: number;
}

interface ValidarRelatoriosViewProps {
  lancamentos?: LancamentoTesouraria[];
  anoSelecionado: number | string;
  onSelectAno?: (ano: number | string) => void;
  onRefresh?: () => void;
  onShowToast: (msg: string) => void;
  usuarioLogado?: MembroItem | null;
  usuarios?: PermissaoUsuario[];
}

const MESES_OPCOES = [
  { valor: 'todos', label: 'Todos os Meses' },
  { valor: '1', label: 'Janeiro' },
  { valor: '2', label: 'Fevereiro' },
  { valor: '3', label: 'Março' },
  { valor: '4', label: 'Abril' },
  { valor: '5', label: 'Maio' },
  { valor: '6', label: 'Junho' },
  { valor: '7', label: 'Julho' },
  { valor: '8', label: 'Agosto' },
  { valor: '9', label: 'Setembro' },
  { valor: '10', label: 'Outubro' },
  { valor: '11', label: 'Novembro' },
  { valor: '12', label: 'Dezembro' },
];

export const ValidarRelatoriosView: React.FC<ValidarRelatoriosViewProps> = ({
  anoSelecionado,
  onSelectAno,
  onShowToast,
  usuarioLogado,
}) => {
  // Aba principal de status: 'pendentes' (P/ Validar) vs 'confirmados'
  const [tabAtiva, setTabAtiva] = useState<'pendentes' | 'confirmados'>('pendentes');
  const [mesFiltro, setMesFiltro] = useState<string>('todos');
  const [setorSelecionadoId, setSetorSelecionadoId] = useState<string | null>(null);
  const [buscaTexto, setBuscaTexto] = useState<string>('');

  // Dados carregados das RPCs do Supabase
  const [setoresList, setSetoresList] = useState<SetorPendenciaRPC[]>([]);
  const [relatorios, setRelatorios] = useState<RelatorioDetalhadoRPC[]>([]);
  const [resumoContadores, setResumoContadores] = useState<{ pendentes: number; confirmados: number }>({
    pendentes: 0,
    confirmados: 0,
  });

  // Estados de carregamento controlados para evitar qualquer piscar de tela
  const [isCarregandoGeral, setIsCarregandoGeral] = useState<boolean>(true);
  const [isAtualizandoTabela, setIsAtualizandoTabela] = useState<boolean>(false);

  // Seleção para ações em lote
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  // Modal de edição de relatório
  const [modalEditarItem, setModalEditarItem] = useState<RelatorioDetalhadoRPC | null>(null);
  const [editCelula, setEditCelula] = useState<string>('');
  const [editData, setEditData] = useState<string>('');
  const [editPix, setEditPix] = useState<number>(0);
  const [editEspecie, setEditEspecie] = useState<number>(0);
  const [salvandoEdicao, setSalvandoEdicao] = useState<boolean>(false);

  const isTodosAnos =
    String(anoSelecionado).toLowerCase() === 'todos' ||
    String(anoSelecionado).toLowerCase() === 'todos os anos' ||
    Number(anoSelecionado) === 0;

  const anosDisponiveis = useMemo(() => {
    const anoAtual = new Date().getFullYear();
    return [anoAtual + 1, anoAtual, anoAtual - 1, anoAtual - 2, anoAtual - 3];
  }, []);

  // Disparador de recarregamento
  const [mutationTrigger, setMutationTrigger] = useState<number>(0);

  const triggerMutation = useCallback(() => {
    setMutationTrigger((prev) => prev + 1);
  }, []);

  // Rastreio de período para executar resumo/setores somente quando necessário
  const ultimoPeriodoRef = useRef<{ ano: number; mes: number | null }>({ ano: -1, mes: -1 });

  // CARREGAMENTO UNIFICADO SEM PISCAR OU DUPLO CARREGAMENTO
  useEffect(() => {
    let isMounted = true;

    const carregar = async () => {
      const pAno = isTodosAnos ? new Date().getFullYear() : Number(anoSelecionado) || new Date().getFullYear();
      const pMes = mesFiltro !== 'todos' && mesFiltro !== '' ? Number(mesFiltro) : null;
      const pSomentePendentes = tabAtiva === 'pendentes' ? true : tabAtiva === 'confirmados' ? false : null;

      const precisaCarregarTudo =
        ultimoPeriodoRef.current.ano !== pAno ||
        ultimoPeriodoRef.current.mes !== pMes ||
        mutationTrigger > 0 ||
        ultimoPeriodoRef.current.ano === -1;

      if (precisaCarregarTudo) {
        setIsCarregandoGeral(true);
      } else {
        setIsAtualizandoTabela(true);
      }

      try {
        if (precisaCarregarTudo) {
          // Consulta única em paralelo sem renderizações intermediárias
          const [resumoRes, setoresRes, relatoriosRes] = await Promise.all([
            TreasuryService.rpcTesourariaResumo(pAno, pMes),
            TreasuryService.rpcTesourariaSetoresPendencias(pAno, pMes),
            TreasuryService.rpcTesourariaRelatoriosDetalhados(pAno, pMes, setorSelecionadoId, pSomentePendentes),
          ]);

          if (!isMounted) return;

          if (resumoRes.isAuthError || setoresRes.isAuthError || relatoriosRes.isAuthError) {
            onShowToast('Sessão expirada ou sem permissão de tesouraria. Faça login novamente.');
            return;
          }

          if (resumoRes.success) setResumoContadores(resumoRes.data);
          if (setoresRes.success) setSetoresList(setoresRes.data);
          if (relatoriosRes.success) setRelatorios(relatoriosRes.data);

          ultimoPeriodoRef.current = { ano: pAno, mes: pMes };
        } else {
          // Apenas atualiza a listagem de relatórios ao trocar setor ou aba
          const relatoriosRes = await TreasuryService.rpcTesourariaRelatoriosDetalhados(
            pAno,
            pMes,
            setorSelecionadoId,
            pSomentePendentes
          );

          if (!isMounted) return;

          if (relatoriosRes.isAuthError) {
            onShowToast('Sessão expirada ou sem permissão de tesouraria.');
            return;
          }

          if (relatoriosRes.success) {
            setRelatorios(relatoriosRes.data);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('Erro ao carregar dados de tesouraria:', err);
          onShowToast('Erro ao carregar dados do servidor.');
        }
      } finally {
        if (isMounted) {
          setIsCarregandoGeral(false);
          setIsAtualizandoTabela(false);
        }
      }
    };

    carregar();

    return () => {
      isMounted = false;
    };
  }, [anoSelecionado, isTodosAnos, mesFiltro, setorSelecionadoId, tabAtiva, mutationTrigger, onShowToast]);

  // Soma de pendências de todas as abas de setores para a aba "Todos"
  const totalPendentesSoma = useMemo(() => {
    if (resumoContadores.pendentes !== undefined) {
      return resumoContadores.pendentes;
    }
    return setoresList.reduce((acc, s) => acc + (s.qtd_pendentes || 0), 0);
  }, [resumoContadores.pendentes, setoresList]);

  // Busca por texto client-side
  const relatoriosFiltrados = useMemo(() => {
    if (!buscaTexto.trim()) return relatorios;
    const busca = buscaTexto.toLowerCase().trim();
    return relatorios.filter((r) => {
      const celula = (r.celula_nome || '').toLowerCase();
      const lider = (r.lideres || '').toLowerCase();
      const data = formatDateBR(r.data_relatorio).toLowerCase();
      return celula.includes(busca) || lider.includes(busca) || data.includes(busca);
    });
  }, [relatorios, buscaTexto]);

  // AÇÃO: VALIDAR RELATÓRIO
  const handleConfirmarItem = async (id: string, celulaNome: string) => {
    try {
      const supabase = getSupabaseClient();
      const idUsuario = usuarioLogado?.id || '1';

      const { error } = await supabase
        .from('relatorios_semanais')
        .update({
          tesouraria_recebido: true,
          data_recebimento: new Date().toISOString(),
          tesoureiro_id: idUsuario,
        })
        .eq('id', id);

      if (error) {
        onShowToast(`Erro ao validar relatório: ${error.message}`);
        return;
      }

      onShowToast(`Relatório "${celulaNome}" validado com sucesso!`);
      setSelecionados((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      triggerMutation();
    } catch (err: any) {
      onShowToast(`Falha ao validar relatório: ${err.message}`);
    }
  };

  // AÇÃO: DESFAZER VALIDAÇÃO DE RELATÓRIO
  const handleDesfazerItem = async (id: string, celulaNome: string) => {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('relatorios_semanais')
        .update({
          tesouraria_recebido: false,
          data_recebimento: null,
          tesoureiro_id: null,
        })
        .eq('id', id);

      if (error) {
        onShowToast(`Erro ao reverter validação: ${error.message}`);
        return;
      }

      onShowToast(`Validação do relatório "${celulaNome}" desfeita.`);
      triggerMutation();
    } catch (err: any) {
      onShowToast(`Falha ao reverter: ${err.message}`);
    }
  };

  // AÇÃO EM LOTE: VALIDAR SELECIONADOS
  const handleConfirmarSelecionados = async () => {
    const ids = Array.from(selecionados);
    if (ids.length === 0) return;

    try {
      const supabase = getSupabaseClient();
      const idUsuario = usuarioLogado?.id || '1';

      const { error } = await supabase
        .from('relatorios_semanais')
        .update({
          tesouraria_recebido: true,
          data_recebimento: new Date().toISOString(),
          tesoureiro_id: idUsuario,
        })
        .in('id', ids);

      if (error) {
        onShowToast(`Erro ao validar relatórios selecionados: ${error.message}`);
        return;
      }

      onShowToast(`${ids.length} relatórios validados com sucesso!`);
      setSelecionados(new Set());
      triggerMutation();
    } catch (err: any) {
      onShowToast(`Falha na validação em lote: ${err.message}`);
    }
  };

  // Checkbox de seleção
  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelecionarTodos = () => {
    if (selecionados.size === relatoriosFiltrados.length && relatoriosFiltrados.length > 0) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(relatoriosFiltrados.map((r) => r.id)));
    }
  };

  const isTodosSelecionados = relatoriosFiltrados.length > 0 && selecionados.size === relatoriosFiltrados.length;

  // Modal de edição (Não permite alterar o nome da célula)
  const handleAbrirEditar = (item: RelatorioDetalhadoRPC) => {
    setModalEditarItem(item);
    setEditCelula(item.celula_nome || '');
    setEditData(formatDateBR(item.data_relatorio));
    setEditPix(item.valor_pix || 0);
    setEditEspecie(item.valor_especie || 0);
  };

  const handleSalvarEdicao = async () => {
    if (!modalEditarItem) return;
    setSalvandoEdicao(true);
    const total = Number((editPix + editEspecie).toFixed(2));

    try {
      await TreasuryService.editarLancamento(modalEditarItem.id, {
        celula: modalEditarItem.celula_nome,
        data: editData,
        pix: editPix,
        especie: editEspecie,
        total,
      });
      onShowToast(`Relatório atualizado com sucesso.`);
      setModalEditarItem(null);
      triggerMutation();
    } catch (e) {
      console.error('Erro ao salvar edição:', e);
      onShowToast('Erro ao salvar alterações no relatório.');
    } finally {
      setSalvandoEdicao(false);
    }
  };

  const labelMesAtual = useMemo(() => {
    const found = MESES_OPCOES.find((m) => m.valor === mesFiltro);
    return found ? found.label : 'Todos os Meses';
  }, [mesFiltro]);

  return (
    <div className="p-3.5 sm:p-6 space-y-4 max-w-[1600px] mx-auto text-slate-100">
      {/* Barra de Controles do Topo */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Seletor de Ano */}
          <div className="relative inline-flex items-center bg-[#13192f] border border-[#242f52] rounded-lg px-3 py-1.5 text-xs text-white font-medium shadow-xs">
            <span className="text-slate-200">Ano: {isTodosAnos ? 'Todos' : anoSelecionado}</span>
            <ChevronDown className="w-3.5 h-3.5 ml-1.5 text-slate-400 pointer-events-none" />
            <select
              value={isTodosAnos ? 'todos' : anoSelecionado}
              onChange={(e) =>
                onSelectAno && onSelectAno(e.target.value === 'todos' ? 'todos' : Number(e.target.value))
              }
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            >
              <option value="todos" className="bg-[#13192f] text-white">
                Todos os Anos
              </option>
              {anosDisponiveis.map((ano) => (
                <option key={ano} value={ano} className="bg-[#13192f] text-white">
                  {ano}
                </option>
              ))}
            </select>
          </div>

          {/* Seletor de Mês */}
          <div className="relative inline-flex items-center bg-[#13192f] border border-[#242f52] rounded-lg px-3 py-1.5 text-xs text-white font-medium shadow-xs">
            <span className="text-slate-200">Mês: {labelMesAtual}</span>
            <ChevronDown className="w-3.5 h-3.5 ml-1.5 text-slate-400 pointer-events-none" />
            <select
              value={mesFiltro}
              onChange={(e) => {
                setMesFiltro(e.target.value);
                setSelecionados(new Set());
              }}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            >
              {MESES_OPCOES.map((m) => (
                <option key={m.valor} value={m.valor} className="bg-[#13192f] text-white">
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {/* Contadores do Topo: P/ Validar (Laranja) e Confirmados */}
          <button
            onClick={() => {
              setTabAtiva('pendentes');
              setSelecionados(new Set());
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ${
              tabAtiva === 'pendentes'
                ? 'bg-[#f08c00] text-white shadow-md ring-1 ring-orange-400/50'
                : 'bg-[#13192f] text-slate-300 border border-[#242f52] hover:text-white'
            }`}
          >
            <span>P/ Validar</span>
            <span className="text-xs font-black px-1.5 py-0.5 rounded-full bg-[#13192f] text-white min-w-[20px] text-center">
              {resumoContadores.pendentes}
            </span>
          </button>

          <button
            onClick={() => {
              setTabAtiva('confirmados');
              setSelecionados(new Set());
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ${
              tabAtiva === 'confirmados'
                ? 'bg-[#009b5a] text-white shadow-md ring-1 ring-emerald-400/50'
                : 'bg-[#13192f] text-slate-300 border border-[#242f52] hover:text-white'
            }`}
          >
            <span>Confirmados</span>
            <span className="text-xs font-black text-[#22c55e]">
              {resumoContadores.confirmados}
            </span>
          </button>

          {/* Campo de Busca Rápida */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar célula, líder..."
              value={buscaTexto}
              onChange={(e) => setBuscaTexto(e.target.value)}
              className="bg-[#13192f] border border-[#242f52] text-xs text-white pl-8 pr-2.5 py-1.5 rounded-lg focus:outline-none focus:border-indigo-400 w-44 sm:w-56 placeholder:text-slate-500"
            />
          </div>
        </div>
      </div>

      {/* 1. ABAS DE FILTRO DE SETORES */}
      <div className="overflow-x-auto scrollbar-thin py-2 px-1 -mx-1">
        <div className="flex items-center gap-3 min-w-max text-[13px] font-medium">
          {/* Aba fixa "Todos" */}
          <button
            onClick={() => setSetorSelecionadoId(null)}
            className={`cursor-pointer transition-all shrink-0 ${
              setorSelecionadoId === null
                ? 'px-3 py-1 rounded-md bg-[#18203a] text-white font-bold border border-[#324370] shadow-xs'
                : 'text-slate-400 hover:text-white px-1 py-0.5'
            }`}
          >
            Todos ({totalPendentesSoma})
          </button>

          {setoresList.length > 0 && (
            <span className="text-[#263155] select-none text-xs">|</span>
          )}

          {/* Abas dinâmicas dos setores */}
          {setoresList.map((setor, index) => {
            const isSelected = setorSelecionadoId === setor.setor_id;
            return (
              <React.Fragment key={setor.setor_id}>
                <button
                  onClick={() => setSetorSelecionadoId(isSelected ? null : setor.setor_id)}
                  className={`cursor-pointer transition-all shrink-0 ${
                    isSelected
                      ? 'px-3 py-1 rounded-md bg-[#18203a] text-white font-bold border border-[#324370] shadow-xs'
                      : 'text-slate-400 hover:text-white px-1 py-0.5'
                  }`}
                >
                  {setor.setor_nome} ({setor.qtd_pendentes})
                </button>
                {index < setoresList.length - 1 && (
                  <span className="text-[#263155] select-none text-xs">|</span>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* 2. TABELA PRINCIPAL DE RELATÓRIOS (Sem piscar) */}
      <div className="rounded-xl overflow-hidden border border-[#263155] bg-[#101528] shadow-md relative">
        {/* Indicador sutil de transição entre setores sem desmontar a tabela */}
        {isAtualizandoTabela && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-indigo-500 animate-pulse z-10"></div>
        )}

        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-xs text-left min-w-[780px]">
            <thead className="bg-[#101528] text-slate-300 uppercase tracking-wider text-[11px] border-b border-[#263155]">
              <tr>
                <th className="px-5 py-3.5 font-bold">CÉLULA</th>
                <th className="px-4 py-3.5 font-bold text-center">DATA</th>
                <th className="px-4 py-3.5 font-bold text-right">PIX</th>
                <th className="px-4 py-3.5 font-bold text-right">ESPÉCIE</th>
                <th className="px-4 py-3.5 font-bold text-center">TOTAL</th>
                <th className="px-3 py-3.5 font-bold text-center text-slate-500">-</th>
                <th className="px-3 py-3.5 font-bold text-center w-10">
                  <button
                    onClick={toggleSelecionarTodos}
                    className="cursor-pointer text-slate-400 hover:text-white"
                    title={isTodosSelecionados ? 'Desmarcar todos' : 'Selecionar todos'}
                  >
                    {isTodosSelecionados ? (
                      <CheckSquare className="w-4 h-4 text-indigo-400 mx-auto" />
                    ) : (
                      <Square className="w-4 h-4 mx-auto text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="px-5 py-3.5 font-bold text-center">AÇÕES</th>
              </tr>
            </thead>
            <tbody
              className={`divide-y divide-[#cbd5e1] transition-opacity duration-150 ${
                isAtualizandoTabela ? 'opacity-70' : 'opacity-100'
              }`}
            >
              {isCarregandoGeral ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400 text-sm bg-[#13192f]">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                      <span>Carregando relatórios da igreja...</span>
                    </div>
                  </td>
                </tr>
              ) : relatoriosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400 text-sm bg-[#13192f]">
                    {tabAtiva === 'pendentes'
                      ? 'Nenhum relatório pendente de validação para o filtro selecionado.'
                      : 'Nenhum relatório confirmado encontrado para o filtro selecionado.'}
                  </td>
                </tr>
              ) : (
                relatoriosFiltrados.map((item) => {
                  const pix = item.valor_pix || 0;
                  const esp = item.valor_especie || 0;
                  const total = pix + esp;
                  const isConfirmado = item.tesouraria_recebido === true;
                  const celulaNome = item.celula_nome || 'Célula';
                  const dataFormatada = formatDateBR(item.data_relatorio);
                  const isItemSelecionado = selecionados.has(item.id);

                  const nomeValidadorFinal =
                    item.nome_tesoureiro ||
                    (item.tesoureiro_id && String(item.tesoureiro_id) === String(usuarioLogado?.id)
                      ? usuarioLogado?.nome
                      : 'Tesoureiro');

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors border-b border-[#cbd5e1] ${
                        isItemSelecionado
                          ? 'bg-[#cbd8e6] text-slate-950 font-medium'
                          : 'bg-[#dce3ec] text-slate-900 hover:bg-[#d4dde8]'
                      }`}
                    >
                      {/* Célula */}
                      <td className="px-5 py-3.5 font-extrabold text-slate-950 text-sm">
                        <div className="tracking-tight">{celulaNome}</div>
                        {isConfirmado && (
                          <div className="text-[11px] font-normal text-slate-600 flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className="font-bold bg-emerald-100 text-emerald-800 border border-emerald-300/70 px-2 py-0.2 rounded text-[10px] inline-flex items-center gap-1">
                              Validado por {nomeValidadorFinal}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Data */}
                      <td className="px-4 py-3.5 text-center font-medium text-slate-800 text-xs">
                        {dataFormatada}
                      </td>

                      {/* PIX */}
                      <td className="px-4 py-3.5 text-right font-bold text-slate-900 text-xs tabular-nums">
                        {formatBRL(pix)}
                      </td>

                      {/* Espécie */}
                      <td className="px-4 py-3.5 text-right font-bold text-slate-900 text-xs tabular-nums">
                        {formatBRL(esp)}
                      </td>

                      {/* Total */}
                      <td className="px-4 py-3.5 text-center">
                        <span className="bg-[#161c32] text-white font-black text-xs px-3 py-1 rounded-md inline-block min-w-[76px] text-center shadow-2xs">
                          {formatBRL(total)}
                        </span>
                      </td>

                      {/* Traço divisor (-) */}
                      <td className="px-3 py-3.5 text-center text-slate-400 font-bold">
                        -
                      </td>

                      {/* Checkbox de Seleção */}
                      <td className="px-3 py-3.5 text-center">
                        <button
                          onClick={() => toggleSelecionado(item.id)}
                          className="cursor-pointer text-slate-700 hover:text-slate-950"
                        >
                          {isItemSelecionado ? (
                            <CheckSquare className="w-4 h-4 text-[#1d63ed]" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                      </td>

                      {/* Botões de Ação */}
                      <td className="px-5 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleAbrirEditar(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1d63ed] hover:bg-[#1554d4] active:scale-95 text-white font-bold text-xs shadow-xs cursor-pointer transition-all"
                            title="Editar Relatório"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>

                          {isConfirmado ? (
                            <button
                              onClick={() => handleDesfazerItem(item.id, celulaNome)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#64748b] hover:bg-[#475569] active:scale-95 text-white font-bold text-xs shadow-xs cursor-pointer transition-all"
                              title="Desfazer validação"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                              <span>Desfazer</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleConfirmarItem(item.id, celulaNome)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#009b5a] hover:bg-[#00824b] active:scale-95 text-white font-bold text-xs shadow-xs cursor-pointer transition-all"
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              <span>Confirmar</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da Tabela */}
        <div className="bg-[#101528] border-t border-[#263155] px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div>
            Total de <span className="text-white font-bold">{relatoriosFiltrados.length}</span> relatório(s) exibido(s)
          </div>
          {selecionados.size > 0 && (
            <div className="text-indigo-300 font-semibold">
              {selecionados.size} de {relatoriosFiltrados.length} selecionado(s)
            </div>
          )}
        </div>
      </div>

      {/* Floating Bottom Modal */}
      {selecionados.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="bg-[#111422] border border-[#2d3550] shadow-[0_16px_48px_rgba(0,0,0,0.85)] rounded-2xl px-5 sm:px-6 py-3.5 flex items-center gap-4 sm:gap-6 text-xs sm:text-sm">
            <span className="text-white font-black tracking-tight whitespace-nowrap text-[13px] sm:text-sm">
              {selecionados.size} relatório(s) selecionado(s)
            </span>

            <button
              onClick={handleConfirmarSelecionados}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#009b5a] hover:bg-[#00824b] active:scale-95 text-white font-bold text-xs sm:text-sm shadow-md cursor-pointer transition-all whitespace-nowrap"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Confirmar Selecionados</span>
            </button>

            <button
              onClick={() => setSelecionados(new Set())}
              className="text-slate-400 hover:text-white underline cursor-pointer text-xs sm:text-sm font-medium transition-colors whitespace-nowrap"
            >
              Desmarcar Todos
            </button>
          </div>
        </div>
      )}

      {/* Modal de Edição de Relatório */}
      {modalEditarItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[#1b1f33] border border-[#2d3450] rounded-2xl w-full max-w-md p-6 shadow-2xl text-slate-100 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#2d3450] mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit className="w-4 h-4 text-[#1d63ed]" />
                Editar Relatório
              </h3>
              <button
                onClick={() => setModalEditarItem(null)}
                className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="text-slate-400 font-bold mb-1 flex items-center gap-1.5">
                  <span>Célula</span>
                  <span className="text-[10px] text-slate-500 font-normal flex items-center gap-1">
                    <Lock className="w-3 h-3 text-slate-500" />
                    (bloqueado)
                  </span>
                </label>
                <input
                  type="text"
                  value={editCelula}
                  disabled
                  readOnly
                  className="w-full bg-[#101322] border border-[#242b44] rounded-lg px-3 py-2 text-slate-400 font-bold cursor-not-allowed select-none opacity-80"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Data (DD/MM/AAAA)</label>
                <input
                  type="text"
                  value={editData}
                  onChange={(e) => setEditData(e.target.value)}
                  className="w-full bg-[#141726] border border-[#2d3450] rounded-lg px-3 py-2 text-white font-medium focus:outline-none focus:border-[#1d63ed]"
                  placeholder="DD/MM/AAAA"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Valor PIX (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editPix}
                    onChange={(e) => setEditPix(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#141726] border border-[#2d3450] rounded-lg px-3 py-2 text-white font-medium focus:outline-none focus:border-[#1d63ed]"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Valor Espécie (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editEspecie}
                    onChange={(e) => setEditEspecie(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#141726] border border-[#2d3450] rounded-lg px-3 py-2 text-white font-medium focus:outline-none focus:border-[#1d63ed]"
                  />
                </div>
              </div>

              <div className="bg-[#141726] border border-[#2d3450] rounded-lg p-3 text-xs flex justify-between items-center font-bold">
                <span className="text-slate-400">Total Calculado:</span>
                <span className="text-emerald-400 text-sm font-black">
                  {formatBRL(editPix + editEspecie)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-6 pt-3 border-t border-[#2d3450]">
              <button
                onClick={() => setModalEditarItem(null)}
                className="px-4 py-2 rounded-lg bg-[#22283e] hover:bg-[#2c334d] text-slate-300 font-semibold text-xs cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarEdicao}
                disabled={salvandoEdicao}
                className="px-4 py-2 rounded-lg bg-[#1d63ed] hover:bg-[#1554d4] text-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{salvandoEdicao ? 'Salvando...' : 'Salvar Alterações'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
