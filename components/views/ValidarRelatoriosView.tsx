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
  RotateCw,
} from 'lucide-react';
import { LancamentoTesouraria, MembroItem, PermissaoUsuario } from '@/lib/types';
import { formatBRL, formatDateBR } from '@/lib/utils';
import { TreasuryService, SEM_SETOR, registrarLimpezaDeCache } from '@/lib/treasury-service';

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
  setor?: string;
  setor_nome?: string;
  ano?: number;
  mes?: number;
  numero_semana?: number;
}

interface SetorPendenciaRPC {
  setor_id: string;
  setor_nome: string;
  qtd_pendentes: number;
}

interface ValidarCache {
  resumo: { pendentes: number; confirmados: number };
  setores: SetorPendenciaRPC[];
  relatorios: RelatorioDetalhadoRPC[];
  ano: string | number;
  mes: string;
}

let globalValidarCache: ValidarCache | null = null;
registrarLimpezaDeCache(() => {
  globalValidarCache = null;
});

interface ValidarRelatoriosViewProps {
  lancamentos?: LancamentoTesouraria[];
  anoSelecionado: number | string;
  onSelectAno?: (ano: number | string) => void;
  /** Anos com relatórios na igreja (do primeiro até o atual), vindos do servidor */
  anosBase?: number[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onShowToast: (msg: string) => void;
  usuarioLogado?: MembroItem | null;
  usuarios?: PermissaoUsuario[];
  /** false quando a tela está escondida: não busca dados no servidor */
  ativa?: boolean;
  /** Informa ao app a quantidade de pendentes (badge do menu) */
  onPendentesChange?: (qtd: number) => void;
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
  lancamentos = [],
  anoSelecionado,
  onSelectAno,
  onRefresh,
  isRefreshing = false,
  onShowToast,
  usuarioLogado,
  ativa = true,
  anosBase = [],
  onPendentesChange,
}) => {
  // Aba principal de status: 'pendentes' (P/ Validar) vs 'confirmados'
  const [tabAtiva, setTabAtiva] = useState<'pendentes' | 'confirmados'>('pendentes');
  const [mesFiltro, setMesFiltro] = useState<string>('todos');
  const [setorSelecionadoId, setSetorSelecionadoId] = useState<string | null>(null);
  const [buscaTexto, setBuscaTexto] = useState<string>('');

  // Dados carregados das RPCs do Supabase - inicializa do cache se já existir
  // Setores da igreja (nomes) vindos do servidor; os contadores são calculados da lista abaixo
  const [setoresServidor, setSetoresServidor] = useState<SetorPendenciaRPC[]>(() => globalValidarCache?.setores || []);
  const [relatorios, setRelatorios] = useState<RelatorioDetalhadoRPC[]>(() => globalValidarCache?.relatorios || []);

  // Contadores SEMPRE derivados dos relatórios: nunca ficam diferentes da lista
  // (antes eram estados separados e desalinhavam após falhas ou cliques rápidos)
  const resumoContadores = useMemo(() => {
    let pendentes = 0;
    relatorios.forEach((r) => {
      if (r.tesouraria_recebido !== true) pendentes++;
    });
    return { pendentes, confirmados: relatorios.length - pendentes };
  }, [relatorios]);

  const setoresList = useMemo<SetorPendenciaRPC[]>(() => {
    const pendentesPorSetor = new Map<string, number>();
    relatorios.forEach((r) => {
      if (r.tesouraria_recebido === true) return;
      const setor = (r.setor || r.setor_nome || SEM_SETOR).trim();
      pendentesPorSetor.set(setor, (pendentesPorSetor.get(setor) || 0) + 1);
    });
    const lista = setoresServidor.map((s) => ({ ...s, qtd_pendentes: pendentesPorSetor.get(s.setor_nome) || 0 }));
    pendentesPorSetor.forEach((qtd, nome) => {
      if (!setoresServidor.some((s) => s.setor_nome === nome)) {
        lista.push({ setor_id: nome, setor_nome: nome, qtd_pendentes: qtd });
      }
    });
    return lista;
  }, [relatorios, setoresServidor]);

  // Mantém o cache da tela igual ao que está na tela (validações, edições)
  useEffect(() => {
    if (globalValidarCache) globalValidarCache.relatorios = relatorios;
  }, [relatorios]);

  // Estados de carregamento controlados para evitar qualquer piscar de tela
  const [isCarregandoGeral, setIsCarregandoGeral] = useState<boolean>(() => !globalValidarCache);
  const [isAtualizandoTabela, setIsAtualizandoTabela] = useState<boolean>(false);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);
  // Recarregamento manual ("Tentar de novo") sem depender do botão global de atualizar
  const [tentativaManual, setTentativaManual] = useState<number>(0);

  // Mantém a função de aviso numa ref: assim o efeito de carregamento NÃO roda de novo
  // só porque a página re-renderizou (era isso que causava o loop de consultas).
  const onShowToastRef = useRef(onShowToast);
  useEffect(() => {
    onShowToastRef.current = onShowToast;
  }, [onShowToast]);

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

  // Mostra apenas anos referentes aos relatórios existentes no banco
  const anosDisponiveis = useMemo(() => {
    const anosSet = new Set<number>();
    anosBase.forEach((a) => anosSet.add(a));

    if (lancamentos && lancamentos.length > 0) {
      lancamentos.forEach((l) => {
        let a = l.ano;
        if (!a && l.dataBR) {
          const parts = l.dataBR.split('/');
          if (parts.length === 3) {
            const parsed = parseInt(parts[2], 10);
            if (!isNaN(parsed) && parsed > 2000) a = parsed;
          }
        } else if (!a && l.data) {
          const parsed = new Date(l.data).getFullYear();
          if (!isNaN(parsed) && parsed > 2000) a = parsed;
        }
        if (a && typeof a === 'number' && a > 2000 && !isNaN(a)) {
          anosSet.add(a);
        }
      });
    }

    if (relatorios && relatorios.length > 0) {
      relatorios.forEach((r) => {
        if (r.data_relatorio) {
          const parts = r.data_relatorio.split('/');
          if (parts.length === 3) {
            const parsed = parseInt(parts[2], 10);
            if (!isNaN(parsed) && parsed > 2000) anosSet.add(parsed);
          } else {
            const parsed = new Date(r.data_relatorio).getFullYear();
            if (!isNaN(parsed) && parsed > 2000) anosSet.add(parsed);
          }
        }
      });
    }

    if (anosSet.size === 0) {
      anosSet.add(new Date().getFullYear());
    }
    return Array.from(anosSet).sort((a, b) => b - a);
  }, [lancamentos, relatorios, anosBase]);

  // Se for o ano atual, exibe apenas até o mês mais recente que estamos
  const mesesDisponiveis = useMemo(() => {
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth() + 1;

    const isAnoAtual =
      isTodosAnos ||
      Number(anoSelecionado) === anoAtual ||
      String(anoSelecionado) === String(anoAtual);

    if (isAnoAtual) {
      return MESES_OPCOES.filter((m) => m.valor === 'todos' || Number(m.valor) <= mesAtual);
    }

    return MESES_OPCOES;
  }, [anoSelecionado, isTodosAnos]);

  // CARREGAMENTO OTIMIZADO: Só consulta o banco no início ou quando usuário clicar em Atualizar
  useEffect(() => {
    let isCancelled = false;

    // Escondida: não consulta. Um "Atualizar" feito em outra tela só invalida o
    // cache, e os dados são recarregados quando esta tela for aberta de novo.
    if (!ativa) {
      if (isRefreshing) globalValidarCache = null;
      return;
    }

    const carregarDados = async () => {
      const pAno = isTodosAnos ? 'todos' : Number(anoSelecionado) || new Date().getFullYear();
      const pMes = mesFiltro !== 'todos' && mesFiltro !== '' ? Number(mesFiltro) : null;
      const mesChave = String(pMes ?? 'todos');

      // Se temos cache e não é forceRefresh (isRefreshing), carrega da memória imediatamente
      if (
        !isRefreshing &&
        globalValidarCache &&
        globalValidarCache.ano === pAno &&
        globalValidarCache.mes === mesChave
      ) {
        if (!isCancelled) {
          setSetoresServidor(globalValidarCache.setores);
          setRelatorios(globalValidarCache.relatorios);
          setIsCarregandoGeral(false);
        }
        return;
      }

      if (!globalValidarCache) {
        setIsCarregandoGeral(true);
      } else {
        setIsAtualizandoTabela(true);
      }

      try {
        // UMA chamada por período: resumo, setores e relatórios vêm juntos do servidor
        const res = await TreasuryService.fetchPainelValidacao(pAno, pMes);

        if (isCancelled) return;

        if (!res.success || !res.data) {
          // Sem novas tentativas automáticas: mostra o erro e espera o usuário pedir de novo
          const msg = res.isAuthError
            ? 'Sessão expirada ou sem permissão de tesouraria. Faça login novamente.'
            : res.error || 'Erro ao carregar dados do servidor.';
          setErroCarregamento(msg);
          onShowToastRef.current(msg);
          return;
        }

        const { resumo: newResumo, setores: newSetores, relatorios: newRelatorios } = res.data;
        setErroCarregamento(null);
        setSetoresServidor(newSetores);
        setRelatorios(newRelatorios);

        // Salva no cache global
        globalValidarCache = {
          resumo: newResumo,
          setores: newSetores,
          relatorios: newRelatorios,
          ano: pAno,
          mes: mesChave,
        };
      } catch (err: any) {
        if (!isCancelled) {
          console.warn('Erro ao carregar dados de tesouraria:', err);
          setErroCarregamento('Erro ao carregar dados do servidor.');
          onShowToastRef.current('Erro ao carregar dados do servidor.');
        }
      } finally {
        if (!isCancelled) {
          setIsCarregandoGeral(false);
          setIsAtualizandoTabela(false);
        }
      }
    };

    carregarDados();

    return () => {
      isCancelled = true;
    };
  }, [ativa, anoSelecionado, isTodosAnos, mesFiltro, isRefreshing, tentativaManual]);

  useEffect(() => {
    onPendentesChange?.(resumoContadores.pendentes);
  }, [resumoContadores.pendentes, onPendentesChange]);

  const tentarCarregarDeNovo = useCallback(() => {
    globalValidarCache = null;
    setErroCarregamento(null);
    setTentativaManual((n) => n + 1);
  }, []);

  // Soma de pendências de todas as abas de setores para a aba "Todos"
  const totalPendentesSoma = resumoContadores.pendentes;

  // FILTRAGEM INSTANTÂNEA CLIENT-SIDE (0ms, 0 consultas ao banco):
  // 1. Aba (P/ Validar vs Confirmados)
  // 2. Setor selecionado
  // 3. Busca de texto
  const relatoriosFiltrados = useMemo(() => {
    const busca = buscaTexto.toLowerCase().trim();

    return relatorios.filter((r) => {
      // 1. Filtro pela aba
      if (tabAtiva === 'pendentes' && r.tesouraria_recebido === true) return false;
      if (tabAtiva === 'confirmados' && r.tesouraria_recebido !== true) return false;

      // 2. Filtro por setor
      if (setorSelecionadoId !== null) {
        let s = (r.setor || r.setor_nome || '').trim().toLowerCase();
        if (!s) {
          s = SEM_SETOR.toLowerCase();
        }
        if (s !== setorSelecionadoId.trim().toLowerCase()) return false;
      }

      // 3. Filtro busca textual
      if (busca) {
        const celula = (r.celula_nome || '').toLowerCase();
        const lider = (r.lideres || '').toLowerCase();
        const data = formatDateBR(r.data_relatorio).toLowerCase();
        if (!celula.includes(busca) && !lider.includes(busca) && !data.includes(busca)) {
          return false;
        }
      }

      return true;
    });
  }, [relatorios, tabAtiva, setorSelecionadoId, buscaTexto]);

  /**
   * Validação/desfazer com atualização otimista. Em caso de falha, desfaz SÓ os
   * itens desta ação, voltando cada um ao estado anterior (antes restaurava uma
   * cópia inteira da lista, apagando outras validações feitas nesse meio tempo).
   */
  const alterarStatus = async (
    ids: string[],
    validar: boolean,
    chamarServidor: () => Promise<{ success: boolean; error?: string; count?: number }>,
    mensagens: { sucesso: string | ((count?: number) => string); erro: string }
  ) => {
    const idsSet = new Set(ids);
    const anteriores = new Map(relatorios.filter((r) => idsSet.has(r.id)).map((r) => [r.id, r]));
    const agora = new Date().toISOString();

    setRelatorios((prev) =>
      prev.map((r) =>
        idsSet.has(r.id)
          ? {
              ...r,
              tesouraria_recebido: validar,
              data_recebimento: validar ? agora : null,
              nome_tesoureiro: validar ? usuarioLogado?.nome || 'Tesoureiro' : null,
            }
          : r
      )
    );
    if (validar) {
      setSelecionados((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }

    let erro: string | null = null;
    let count: number | undefined;
    try {
      const res = await chamarServidor();
      if (!res.success) erro = res.error || 'falha no servidor';
      count = res.count;
    } catch (err: any) {
      erro = err?.message || 'falha de conexão';
    }

    if (erro) {
      setRelatorios((prev) => prev.map((r) => anteriores.get(r.id) ?? r));
      onShowToast(`${mensagens.erro}: ${erro}`);
    } else {
      onShowToast(typeof mensagens.sucesso === 'function' ? mensagens.sucesso(count) : mensagens.sucesso);
    }
  };

  const handleConfirmarItem = (id: string, celulaNome: string) =>
    alterarStatus([id], true, () => TreasuryService.confirmarLancamento(id, usuarioLogado?.id || ''), {
      sucesso: `Relatório "${celulaNome}" validado com sucesso!`,
      erro: 'Erro ao validar relatório',
    });

  const handleDesfazerItem = (id: string, celulaNome: string) =>
    alterarStatus([id], false, () => TreasuryService.desconfirmarLancamento(id), {
      sucesso: `Validação do relatório "${celulaNome}" desfeita.`,
      erro: 'Erro ao reverter validação',
    });

  const handleConfirmarSelecionados = () => {
    const ids = Array.from(selecionados);
    if (ids.length === 0) return;
    return alterarStatus(ids, true, () => TreasuryService.confirmarLancamentosEmMassa(ids, usuarioLogado?.id || ''), {
      sucesso: (count) =>
        count !== undefined && count < ids.length
          ? `${count} relatório(s) validado(s); ${ids.length - count} já haviam sido validados por outra pessoa.`
          : `${ids.length} relatórios validados com sucesso!`,
      erro: 'Erro ao validar relatórios selecionados',
    });
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
      const res = await TreasuryService.editarLancamento(modalEditarItem.id, {
        celula: modalEditarItem.celula_nome,
        data: editData,
        pix: editPix,
        especie: editEspecie,
        total,
      });
      if (!res.success) {
        onShowToast(`Erro ao salvar: ${res.error || 'falha no servidor'}`);
        return;
      }

      setRelatorios((prev) =>
        prev.map((r) =>
          r.id === modalEditarItem.id
            ? { ...r, valor_pix: editPix, valor_especie: editEspecie }
            : r
        )
      );
      onShowToast(`Relatório atualizado com sucesso.`);
      setModalEditarItem(null);
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
              {mesesDisponiveis.map((m) => (
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

          {/* Botão de Atualizar dados no banco */}
          <button
            onClick={() => onRefresh?.()}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#13192f] border border-[#242f52] hover:border-indigo-500/50 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-xs active:scale-[0.98]"
            title="Sincronizar e consultar dados novamente no Supabase"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      </div>

      {/* 1. ABAS DE FILTRO DE SETORES */}
      <div className="overflow-x-auto scrollbar-thin py-2 px-1 -mx-1">
        <div className="flex items-center gap-2 min-w-max text-xs font-semibold">
          {/* Aba fixa "Todos" */}
          <button
            onClick={() => setSetorSelecionadoId(null)}
            className={`px-3 py-1.5 rounded-md border text-xs font-semibold cursor-pointer transition-colors shrink-0 ${
              setorSelecionadoId === null
                ? 'bg-[#18203a] text-white border-[#324370] shadow-xs'
                : 'bg-transparent text-slate-400 hover:text-white hover:bg-[#141a2e] border-transparent'
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
                  className={`px-3 py-1.5 rounded-md border text-xs font-semibold cursor-pointer transition-colors shrink-0 ${
                    isSelected
                      ? 'bg-[#18203a] text-white border-[#324370] shadow-xs'
                      : 'bg-transparent text-slate-400 hover:text-white hover:bg-[#141a2e] border-transparent'
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
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-xs text-left min-w-[780px]">
            <thead className="bg-[#101528] text-slate-300 uppercase tracking-wider text-[11px] border-b border-[#263155]">
              <tr>
                <th className="px-5 py-3.5 font-bold w-64 min-w-[240px] max-w-[320px]">CÉLULA</th>
                <th className="px-4 py-3.5 font-bold text-center w-28">DATA</th>
                <th className="px-4 py-3.5 font-bold text-right w-28">PIX</th>
                <th className="px-4 py-3.5 font-bold text-right w-28">ESPÉCIE</th>
                <th className="px-4 py-3.5 font-bold text-center w-32">TOTAL</th>
                <th className="px-3 py-3.5 font-bold text-center w-12">
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
                <th className="px-5 py-3.5 font-bold text-center w-52">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#cbd5e1]">
              {isCarregandoGeral ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 text-sm bg-[#13192f]">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                      <span>Carregando relatórios da igreja...</span>
                    </div>
                  </td>
                </tr>
              ) : erroCarregamento && relatorios.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-sm bg-[#13192f]">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <span className="text-rose-300">{erroCarregamento}</span>
                      <button
                        type="button"
                        onClick={tentarCarregarDeNovo}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        Tentar de novo
                      </button>
                    </div>
                  </td>
                </tr>
              ) : relatoriosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 text-sm bg-[#13192f]">
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
                      <td className="px-5 py-3.5 font-extrabold text-slate-950 text-sm w-64 min-w-[240px] max-w-[320px]">
                        <div className="tracking-tight truncate">{celulaNome}</div>
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
