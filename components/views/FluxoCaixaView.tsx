'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Plus,
  RotateCw,
  Search,
  Filter,
  DollarSign,
  Calendar,
  Tag,
  FileText,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Edit2,
  X,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
  Menu,
  Clock,
  User,
  Layers,
} from 'lucide-react';
import { FluxoCaixaItem, FluxoCaixaKPIs, FluxoMensalDemonstrativo, FluxoCaixaPayload, MembroItem } from '@/lib/types';
import { TreasuryService } from '@/lib/treasury-service';
import { formatBRL } from '@/lib/utils';

interface FluxoCaixaViewProps {
  ativa?: boolean;
  anoSelecionado: number | string;
  onSelectAno: (ano: number | string) => void;
  anosBase?: number[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
  /** Incrementado a cada clique em "Atualizar": força UMA nova leitura */
  refreshToken?: number;
  onToggleMobileMenu?: () => void;
  onShowToast?: (msg: string) => void;
  usuarioLogado?: MembroItem | null;
}

const MESES_NOMES = [
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

const CATEGORIAS_PADRAO = [
  'Dízimos',
  'Ofertas de Célula',
  'Ofertas de Culto',
  'Doações e Contribuições',
  'Eventos e Conferências',
  'Aluguel do Templo',
  'Energia Elétrica',
  'Água e Saneamento',
  'Internet e Tecnologia',
  'Manutenção e Reformas',
  'Material de Expediente / Escritório',
  'Equipamentos de Som e Multimídia',
  'Missões e Ação Social',
  'Ajuda de Custo / Pastoral',
  'Limpeza e Conservação',
  'Cantina e Alimentação',
  'Outras Entradas',
  'Outras Saídas',
];



export const FluxoCaixaView: React.FC<FluxoCaixaViewProps> = ({
  ativa = true,
  anoSelecionado,
  onSelectAno,
  anosBase = [],
  onRefresh,
  isRefreshing = false,
  refreshToken = 0,
  onToggleMobileMenu,
  onShowToast,
  usuarioLogado,
}) => {
  // Filtros de visualização
  const [mesSelecionado, setMesSelecionado] = useState<string>('todos');
  const [tipoFiltro, setTipoFiltro] = useState<string>('todos');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todos');
  const [buscaTexto, setBuscaTexto] = useState<string>('');

  // Estados de dados (SEM DADOS FICTÍCIOS)
  // Lançamentos do período (ano/mês) vindos do servidor
  const [movimentacoesPeriodo, setMovimentacoes] = useState<FluxoCaixaItem[]>([]);
  // Tipo, categoria e busca: filtrados aqui, sem nova consulta (antes cada tecla da busca
  // disparava 3 requisições)
  const movimentacoes = useMemo(() => {
    const busca = buscaTexto.trim().toLowerCase();
    const tipo = tipoFiltro.toLowerCase();
    return movimentacoesPeriodo.filter((item) => {
      const tipoItem = String(item.TipoFluxo || '').toLowerCase();
      if (tipo !== 'todos') {
        if (tipo.includes('entrada') && !tipoItem.includes('entrada')) return false;
        if ((tipo.includes('saída') || tipo.includes('saida')) && !/sa.da/.test(tipoItem)) return false;
      }
      if (categoriaFiltro !== 'todos' && categoriaFiltro !== 'todas as categorias' && item.CategoriaFluxo !== categoriaFiltro) {
        return false;
      }
      if (busca) {
        const obs = String(item.ObservacoesFluxo || '').toLowerCase();
        const cat = String(item.CategoriaFluxo || '').toLowerCase();
        const idStr = String(item.ID || item.id || '').toLowerCase();
        if (!obs.includes(busca) && !cat.includes(busca) && !idStr.includes(busca)) return false;
      }
      return true;
    });
  }, [movimentacoesPeriodo, tipoFiltro, categoriaFiltro, buscaTexto]);
  const [kpis, setKpis] = useState<FluxoCaixaKPIs>({
    saldoAtual: 0,
    entradasMes: 0,
    saidasMes: 0,
    saldoMes: 0,
    situacao: 'SUPERÁVIT ACUMULADO',
    anoCompletoEntradas: 0,
    comprometimento: 0,
    resultadoLiquido: 'POSITIVO',
  });
  const [demonstrativo, setDemonstrativo] = useState<FluxoMensalDemonstrativo[]>([]);
  const [categoriasDisponiveis, setCategoriasDisponiveis] = useState<string[]>(CATEGORIAS_PADRAO);
  const [anosDisponiveis, setAnosDisponiveis] = useState<number[]>([new Date().getFullYear()]);

  // Estados de controle da interface
  const [carregando, setCarregando] = useState<boolean>(true);
  const [tabelaCriada, setTabelaCriada] = useState<boolean>(true);
  const [modalNovoAberto, setModalNovoAberto] = useState<boolean>(false);
  const [itemParaEditar, setItemParaEditar] = useState<FluxoCaixaItem | null>(null);
  const [itemParaExcluir, setItemParaExcluir] = useState<FluxoCaixaItem | null>(null);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [excluindo, setExcluindo] = useState<boolean>(false);

  // Formulário de novo / edição
  const [formTipo, setFormTipo] = useState<'Entrada' | 'Saída'>('Entrada');
  const [formValor, setFormValor] = useState<string>('');
  const [formData, setFormData] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [formCategoria, setFormCategoria] = useState<string>(CATEGORIAS_PADRAO[0]);
  const [formNovaCategoria, setFormNovaCategoria] = useState<string>('');
  const [formStatus, setFormStatus] = useState<string>('CONFIRMADO');
  const [formObservacoes, setFormObservacoes] = useState<string>('');
  const [formErro, setFormErro] = useState<string | null>(null);

  // Aviso numa ref: o efeito de carregamento não roda de novo só porque a página re-renderizou
  const onShowToastRef = useRef(onShowToast);
  useEffect(() => {
    onShowToastRef.current = onShowToast;
  }, [onShowToast]);

  // Releitura pedida pela própria tela (depois de salvar/excluir: o serviço já descartou o cache)
  const [versaoDados, setVersaoDados] = useState<number>(0);
  const carregarDadosFluxo = useCallback(() => {
    setVersaoDados((n) => n + 1);
  }, []);

  // Lista + indicadores: UMA leitura por período (ano/mês), com cache no serviço.
  // Trocar tipo, categoria ou busca não consulta o banco. "Atualizar" força uma leitura por clique.
  const refreshAtendidoRef = useRef(refreshToken);
  useEffect(() => {
    if (!ativa) return;
    let cancel = false;
    const forcar = refreshToken !== refreshAtendidoRef.current;
    // Estados atualizados dentro da função assíncrona (regra react-hooks/set-state-in-effect)
    const carregar = async () => {
      setCarregando(true);
      try {
        const res = await TreasuryService.fetchFluxoPeriodo(anoSelecionado, mesSelecionado, forcar);
        if (cancel) return;
        if (!res.success || !res.data) {
          setMovimentacoes([]);
          if (onShowToastRef.current) {
            onShowToastRef.current(
              res.isAuthError
                ? 'Sessão expirada ou sem permissão de tesouraria. Faça login novamente.'
                : res.error || 'Erro ao consultar movimentações financeiras.'
            );
          }
          return;
        }
        refreshAtendidoRef.current = refreshToken;
        const d = res.data;
        setMovimentacoes(d.lista);
        setTabelaCriada(d.tabelaCriada);
        setKpis(d.kpis);
        setDemonstrativo(d.demonstrativo);
        if (d.anosDisponiveis.length > 0) setAnosDisponiveis(d.anosDisponiveis);
      } catch (err: any) {
        if (!cancel) {
          console.warn('Erro ao carregar dados de fluxo de caixa:', err);
          if (onShowToastRef.current) onShowToastRef.current('Erro ao consultar movimentações financeiras.');
        }
      } finally {
        if (!cancel) setCarregando(false);
      }
    };
    carregar();
    return () => {
      cancel = true;
    };
  }, [ativa, anoSelecionado, mesSelecionado, refreshToken, versaoDados]);

  // Categorias: uma leitura por sessão (cache de 30 min no serviço), não a cada filtro
  useEffect(() => {
    if (!ativa) return;
    let cancel = false;
    TreasuryService.fetchCategoriasFluxo().then((resCats) => {
      if (cancel || !resCats.success || !resCats.data?.length) return;
      setCategoriasDisponiveis(Array.from(new Set([...CATEGORIAS_PADRAO, ...resCats.data])).sort());
    });
    return () => {
      cancel = true;
    };
  }, [ativa, versaoDados, refreshToken]);

  // Reset do formulário
  const resetForm = () => {
    setFormTipo('Entrada');
    setFormValor('');
    setFormData(new Date().toISOString().slice(0, 10));
    setFormCategoria(CATEGORIAS_PADRAO[0]);
    setFormNovaCategoria('');
    setFormStatus('CONFIRMADO');
    setFormObservacoes('');
    setFormErro(null);
    setItemParaEditar(null);
  };

  const abrirModalNovo = () => {
    resetForm();
    setModalNovoAberto(true);
  };

  const abrirModalEditar = (item: FluxoCaixaItem) => {
    setItemParaEditar(item);
    setFormTipo(item.TipoFluxo === 'Saída' ? 'Saída' : 'Entrada');
    setFormValor(item.ValorFluxo ? item.ValorFluxo.toFixed(2).replace('.', ',') : '');
    setFormData(item.DataFluxo ? item.DataFluxo.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setFormCategoria(item.CategoriaFluxo || CATEGORIAS_PADRAO[0]);
    setFormNovaCategoria('');
    setFormStatus(item.StatusFluxo || 'CONFIRMADO');
    setFormObservacoes(item.ObservacoesFluxo || '');
    setFormErro(null);
    setModalNovoAberto(true);
  };

  // Salvar novo lançamento ou atualização
  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErro(null);

    // Validação de valor
    const valorLimpo = formValor.replace(/\./g, '').replace(',', '.');
    const valorNumerico = parseFloat(valorLimpo);
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      setFormErro('Informe um valor válido maior que zero (ex: 150,00).');
      return;
    }

    // Validação de categoria
    const categoriaFinal = (formCategoria === '__NOVA__' ? formNovaCategoria : formCategoria).trim();
    if (!categoriaFinal) {
      setFormErro('Por favor, informe a categoria da movimentação.');
      return;
    }

    if (!formData) {
      setFormErro('Por favor, selecione a data do lançamento.');
      return;
    }

    setSalvando(true);
    try {
      const payload: FluxoCaixaPayload = {
        TipoFluxo: formTipo,
        ValorFluxo: Math.round(valorNumerico * 100) / 100,
        DataFluxo: formData,
        CategoriaFluxo: categoriaFinal,
        StatusFluxo: formStatus,
        ObservacoesFluxo: formObservacoes.trim() || null,
      };

      if (itemParaEditar) {
        const res = await TreasuryService.atualizarFluxoCaixa(itemParaEditar.ID || itemParaEditar.id!, payload);
        if (res.success) {
          if (onShowToast) onShowToast('Lançamento atualizado com sucesso!');
          setModalNovoAberto(false);
          resetForm();
          await carregarDadosFluxo();
        } else {
          setFormErro(res.error || 'Erro ao atualizar movimentação.');
        }
      } else {
        const res = await TreasuryService.criarFluxoCaixa(payload);
        if (res.success) {
          if (onShowToast) onShowToast('Novo lançamento cadastrado com sucesso!');
          setModalNovoAberto(false);
          resetForm();
          await carregarDadosFluxo();
        } else {
          setFormErro(res.error || 'Erro ao cadastrar movimentação.');
        }
      }
    } catch (err: any) {
      setFormErro(err?.message || 'Erro inesperado ao salvar movimentação.');
    } finally {
      setSalvando(false);
    }
  };

  // Excluir lançamento
  const handleConfirmarExclusao = async () => {
    if (!itemParaExcluir) return;
    setExcluindo(true);
    try {
      const id = itemParaExcluir.ID || itemParaExcluir.id!;
      const res = await TreasuryService.excluirFluxoCaixa(id);
      if (res.success) {
        if (onShowToast) onShowToast('Lançamento excluído com sucesso!');
        setItemParaExcluir(null);
        await carregarDadosFluxo();
      } else {
        if (onShowToast) onShowToast(res.error || 'Erro ao excluir lançamento.');
      }
    } catch (err: any) {
      if (onShowToast) onShowToast(err?.message || 'Erro ao excluir.');
    } finally {
      setExcluindo(false);
    }
  };



  // Cálculos dinâmicos da listagem filtrada
  const totalEntradasFiltradas = useMemo(() => {
    return movimentacoes
      .filter((m) => String(m.TipoFluxo || '').toLowerCase().includes('entrada'))
      .reduce((acc, m) => acc + Number(m.ValorFluxo || 0), 0);
  }, [movimentacoes]);

  const totalSaidasFiltradas = useMemo(() => {
    return movimentacoes
      .filter((m) => String(m.TipoFluxo || '').toLowerCase().includes('saída') || String(m.TipoFluxo || '').toLowerCase().includes('saida'))
      .reduce((acc, m) => acc + Number(m.ValorFluxo || 0), 0);
  }, [movimentacoes]);

  const saldoFiltrado = useMemo(() => {
    return totalEntradasFiltradas - totalSaidasFiltradas;
  }, [totalEntradasFiltradas, totalSaidasFiltradas]);

  // Lista consolidada de anos para o seletor
  const listaAnos = useMemo(() => {
    const setAnos = new Set<number>();
    anosBase.forEach((a) => setAnos.add(a));
    anosDisponiveis.forEach((a) => setAnos.add(a));
    setAnos.add(new Date().getFullYear());
    return Array.from(setAnos).sort((a, b) => b - a);
  }, [anosBase, anosDisponiveis]);

  // Maior valor no demonstrativo para escala do gráfico
  const maxDemonstrativo = useMemo(() => {
    let max = 1000;
    demonstrativo.forEach((d) => {
      if (d.entradas > max) max = d.entradas;
      if (d.saidas > max) max = d.saidas;
    });
    return max;
  }, [demonstrativo]);

  return (
    <div className="p-3.5 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Top Header & Controles Integrados */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#2a2f48]">
        <div className="flex items-center gap-2.5">
          {onToggleMobileMenu && (
            <button
              onClick={onToggleMobileMenu}
              className="md:hidden p-1.5 -ml-1 rounded-lg text-slate-300 hover:text-white hover:bg-[#282e48] transition-colors cursor-pointer"
              aria-label="Abrir Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <div>
            <p className="text-[11px] sm:text-xs text-slate-400 font-medium">Tesouraria Geral</p>
            <h1 className="text-lg sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              Fluxo de Caixa
            </h1>
          </div>
        </div>

        {/* Barra de Ações Rápidas & Seletores */}
        <div className="flex items-center flex-wrap gap-2 ml-auto">
          {/* Seletor de Ano */}
          <div className="flex items-center gap-1 bg-[#252a40] px-2.5 py-1.5 rounded-lg border border-[#394164]">
            <label className="text-xs text-slate-300 font-medium">Ano:</label>
            <select
              value={anoSelecionado}
              onChange={(e) => onSelectAno(e.target.value === 'todos' ? 'todos' : Number(e.target.value))}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
            >
              <option value="todos" className="bg-[#1c2030] text-white">
                Todos os Anos
              </option>
              {listaAnos.map((ano) => (
                <option key={ano} value={ano} className="bg-[#1c2030] text-white">
                  {ano}
                </option>
              ))}
            </select>
          </div>

          {/* Seletor de Mês */}
          <div className="flex items-center gap-1 bg-[#252a40] px-2.5 py-1.5 rounded-lg border border-[#394164]">
            <label className="text-xs text-slate-300 font-medium">Mês:</label>
            <select
              value={mesSelecionado}
              onChange={(e) => setMesSelecionado(e.target.value)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
            >
              {MESES_NOMES.map((m) => (
                <option key={m.valor} value={m.valor} className="bg-[#1c2030] text-white">
                  {m.label}
                </option>
              ))}
            </select>
          </div>



          {/* Botão Sincronizar */}
          <button
            onClick={() => {
              // "Atualizar" geral já força esta tela (refreshToken); sem ele, recarrega só aqui
              if (onRefresh) onRefresh();
              else carregarDadosFluxo();
            }}
            disabled={carregando || isRefreshing}
            className="p-2 rounded-lg bg-[#252a40] hover:bg-[#313754] text-slate-300 hover:text-white border border-[#394164] transition-colors cursor-pointer"
            title="Sincronizar dados com o Supabase"
          >
            <RotateCw className={`w-4 h-4 ${carregando || isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          {/* Botão Novo Lançamento */}
          <button
            onClick={abrirModalNovo}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Lançamento</span>
          </button>
        </div>
      </div>



      {/* 4 Cards de KPIs Financeiros Reais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Saldo Geral Acumulado */}
        <div className="bg-[#24293f] p-4 rounded-xl border border-[#323955] relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 font-medium">Saldo Geral Acumulado</p>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                kpis.saldoAtual >= 0
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
              }`}
            >
              {kpis.situacao}
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-white tracking-tight font-mono mt-2">
            {formatBRL(kpis.saldoAtual)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <span>Todo o histórico da igreja</span>
          </p>
        </div>

        {/* Card 2: Entradas no Período */}
        <div className="bg-[#24293f] p-4 rounded-xl border border-[#323955] relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 font-medium">Entradas no Período</p>
            <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <ArrowDownLeft className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-400 tracking-tight font-mono mt-2">
            {formatBRL(kpis.entradasMes)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Ano completo: <span className="text-slate-200 font-mono font-medium">{formatBRL(kpis.anoCompletoEntradas)}</span>
          </p>
        </div>

        {/* Card 3: Saídas no Período */}
        <div className="bg-[#24293f] p-4 rounded-xl border border-[#323955] relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 font-medium">Saídas no Período</p>
            <div className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-rose-400 tracking-tight font-mono mt-2">
            {formatBRL(kpis.saidasMes)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Comprometimento: <span className="text-slate-200 font-medium">{kpis.comprometimento}%</span> das receitas
          </p>
        </div>

        {/* Card 4: Resultado Líquido do Período */}
        <div className="bg-[#24293f] p-4 rounded-xl border border-[#323955] relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 font-medium">Resultado do Período</p>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                kpis.saldoMes >= 0
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
              }`}
            >
              {kpis.resultadoLiquido}
            </span>
          </div>
          <p
            className={`text-xl sm:text-2xl font-black tracking-tight font-mono mt-2 ${
              kpis.saldoMes >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatBRL(kpis.saldoMes)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Receitas menos despesas do filtro
          </p>
        </div>
      </div>

      {/* Demonstrativo Mensal Interativo (Gráfico de Barras com Dados Reais) */}
      <div className="bg-[#24293f] p-4 sm:p-5 rounded-xl border border-[#323955]">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              Demonstrativo Mensal de Entradas e Saídas ({anoSelecionado === 'todos' ? 'Ano Atual' : anoSelecionado})
            </h3>
            <p className="text-xs text-slate-400">Comparativo mês a mês das movimentações registradas</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-emerald-500"></span>
              <span className="text-slate-300">Entradas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-rose-500"></span>
              <span className="text-slate-300">Saídas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1 bg-indigo-400 rounded-full"></span>
              <span className="text-slate-300">Resultado Líquido</span>
            </div>
          </div>
        </div>

        {/* Gráfico de Barras SVG Responsivo */}
        <div className="h-44 sm:h-52 w-full flex items-end gap-1 sm:gap-2 pt-6 pb-2 px-1 border-b border-[#323955]">
          {demonstrativo.map((item) => {
            const percEntrada = maxDemonstrativo > 0 ? (item.entradas / maxDemonstrativo) * 100 : 0;
            const percSaida = maxDemonstrativo > 0 ? (item.saidas / maxDemonstrativo) * 100 : 0;
            const temMovimento = item.entradas > 0 || item.saidas > 0;

            return (
              <div
                key={item.mesNumero}
                className="flex-1 h-full flex flex-col justify-end items-center group relative cursor-pointer"
              >
                {/* Tooltip flutuante ao passar o mouse */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none absolute bottom-full mb-2 z-30 bg-[#161a29] border border-[#3b4366] text-white p-2.5 rounded-lg shadow-xl text-[11px] whitespace-nowrap min-w-[140px]">
                  <p className="font-bold text-white mb-1 border-b border-[#2b314c] pb-0.5">
                    {item.mesNome} / {item.ano}
                  </p>
                  <p className="text-emerald-400 flex justify-between gap-2">
                    <span>Entradas:</span>
                    <span className="font-mono font-bold">{formatBRL(item.entradas)}</span>
                  </p>
                  <p className="text-rose-400 flex justify-between gap-2">
                    <span>Saídas:</span>
                    <span className="font-mono font-bold">{formatBRL(item.saidas)}</span>
                  </p>
                  <p className={`flex justify-between gap-2 font-bold pt-1 border-t border-[#2b314c] ${item.resultado >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    <span>Resultado:</span>
                    <span className="font-mono">{formatBRL(item.resultado)}</span>
                  </p>
                </div>

                {/* Par de Barras (Entrada e Saída) */}
                <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 h-full">
                  <div
                    style={{ height: `${Math.max(percEntrada, temMovimento ? 3 : 1)}%` }}
                    className={`w-full max-w-[14px] sm:max-w-[18px] rounded-t-xs transition-all duration-300 ${
                      item.entradas > 0 ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-slate-700/30'
                    }`}
                  />
                  <div
                    style={{ height: `${Math.max(percSaida, temMovimento ? 3 : 1)}%` }}
                    className={`w-full max-w-[14px] sm:max-w-[18px] rounded-t-xs transition-all duration-300 ${
                      item.saidas > 0 ? 'bg-rose-500 hover:bg-rose-400' : 'bg-slate-700/30'
                    }`}
                  />
                </div>

                {/* Rótulo do Mês */}
                <span className="text-[10px] sm:text-xs text-slate-400 mt-2 font-medium">
                  {item.mesAbrev}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Seção da Tabela de Lançamentos com Filtros Avançados */}
      <div className="bg-[#24293f] rounded-xl border border-[#323955] overflow-hidden">
        {/* Barra de Filtros e Busca */}
        <div className="p-3.5 sm:p-4 border-b border-[#323955] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center flex-wrap gap-2.5 flex-1 min-w-[280px]">
            {/* Campo de Busca Textual */}
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por descrição, categoria..."
                value={buscaTexto}
                onChange={(e) => setBuscaTexto(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-[#1b1f33] border border-[#323955] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Filtro por Tipo */}
            <div className="flex items-center gap-1 bg-[#1b1f33] px-2.5 py-1.5 rounded-lg border border-[#323955]">
              <span className="text-[11px] text-slate-400">Tipo:</span>
              <select
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value)}
                className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer"
              >
                <option value="todos" className="bg-[#1c2030] text-white">
                  Todos (Entradas & Saídas)
                </option>
                <option value="Entrada" className="bg-[#1c2030] text-emerald-400">
                  Apenas Entradas
                </option>
                <option value="Saída" className="bg-[#1c2030] text-rose-400">
                  Apenas Saídas
                </option>
              </select>
            </div>

            {/* Filtro por Categoria */}
            <div className="flex items-center gap-1 bg-[#1b1f33] px-2.5 py-1.5 rounded-lg border border-[#323955]">
              <span className="text-[11px] text-slate-400">Categoria:</span>
              <select
                value={categoriaFiltro}
                onChange={(e) => setCategoriaFiltro(e.target.value)}
                className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer max-w-[160px] truncate"
              >
                <option value="todos" className="bg-[#1c2030] text-white">
                  Todas as Categorias
                </option>
                {categoriasDisponiveis.map((cat) => (
                  <option key={cat} value={cat} className="bg-[#1c2030] text-white">
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Resumo Rápido da Tabela */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400">
              <strong className="text-white font-mono">{movimentacoes.length}</strong> registro(s)
            </span>
            <span className="text-slate-400 hidden sm:inline">|</span>
            <span className="text-slate-300 hidden sm:inline">
              Total Líquido:{' '}
              <strong className={`font-mono ${saldoFiltrado >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatBRL(saldoFiltrado)}
              </strong>
            </span>
          </div>
        </div>

        {/* Tabela de Dados */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#1d2136] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#323955]">
                <th className="py-3 px-4 font-semibold">Data</th>
                <th className="py-3 px-4 font-semibold">Tipo</th>
                <th className="py-3 px-4 font-semibold">Categoria</th>
                <th className="py-3 px-4 font-semibold">Observações / Detalhes</th>
                <th className="py-3 px-4 font-semibold text-right">Valor</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Tesoureiro</th>
                <th className="py-3 px-4 font-semibold text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a304a]">
              {carregando ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RotateCw className="w-6 h-6 animate-spin mx-auto text-indigo-400 mb-2" />
                    <p className="text-xs">Carregando movimentações do banco de dados...</p>
                  </td>
                </tr>
              ) : movimentacoes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-full bg-[#1b1f33] text-slate-500 mx-auto flex items-center justify-center">
                        <FileText className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold text-slate-300">
                        Nenhuma movimentação financeira encontrada
                      </p>
                      <p className="text-xs text-slate-400">
                        Não existem registros para os filtros selecionados ou nenhum lançamento foi cadastrado ainda.
                      </p>
                      <button
                        onClick={abrirModalNovo}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Registrar Primeiro Lançamento</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                movimentacoes.map((item) => {
                  const isEntrada = String(item.TipoFluxo || '').toLowerCase().includes('entrada');
                  const dataFormatada = item.DataFluxo
                    ? new Date(`${item.DataFluxo.slice(0, 10)}T12:00:00Z`).toLocaleDateString('pt-BR')
                    : '-';

                  return (
                    <tr
                      key={item.ID || item.id}
                      className="hover:bg-[#2b314c]/40 transition-colors duration-150"
                    >
                      {/* Data */}
                      <td className="py-3 px-4 text-slate-200 font-mono whitespace-nowrap">
                        {dataFormatada}
                      </td>

                      {/* Tipo */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isEntrada
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {isEntrada ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          {item.TipoFluxo}
                        </span>
                      </td>

                      {/* Categoria */}
                      <td className="py-3 px-4 font-semibold text-white whitespace-nowrap">
                        {item.CategoriaFluxo}
                      </td>

                      {/* Observações */}
                      <td className="py-3 px-4 text-slate-300 max-w-[280px] truncate" title={item.ObservacoesFluxo || ''}>
                        {item.ObservacoesFluxo || <span className="text-slate-500 italic">Sem observações</span>}
                      </td>

                      {/* Valor */}
                      <td className={`py-3 px-4 font-mono font-bold text-right whitespace-nowrap ${isEntrada ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isEntrada ? '+' : '-'} {formatBRL(item.ValorFluxo)}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                          {item.StatusFluxo || 'CONFIRMADO'}
                        </span>
                      </td>

                      {/* Tesoureiro */}
                      <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                        {item.nome_tesoureiro || 'Tesoureiro'}
                      </td>

                      {/* Ações */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => abrirModalEditar(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors cursor-pointer"
                            title="Editar lançamento"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setItemParaExcluir(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Excluir lançamento"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Novo Lançamento / Editar Lançamento */}
      {modalNovoAberto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[#1a1d2e] border border-[#2d3450] rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col text-slate-100 animate-in zoom-in-95 duration-150">
            {/* Header do Modal com Ícone e Subtítulo */}
            <div className="p-4 sm:p-5 border-b border-[#262b44] flex items-center justify-between bg-[#1f243b]">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 transition-colors ${
                    formTipo === 'Entrada'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                  }`}
                >
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                    {itemParaEditar ? 'Editar Lançamento' : 'Novo Lançamento'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Preencha as informações para registrar no fluxo de caixa
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalNovoAberto(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#282f4c] border border-transparent hover:border-[#384164] transition-colors cursor-pointer"
                title="Fechar modal"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvar} className="p-4 sm:p-6 space-y-4 sm:space-y-4.5 overflow-y-auto max-h-[calc(90vh-140px)]">
              {formErro && (
                <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{formErro}</span>
                </div>
              )}

              {/* Seletor de Tipo (Entrada ou Saída) em Cards Estilizados */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Tipo de Movimentação *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormTipo('Entrada')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                      formTipo === 'Entrada'
                        ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-sm shadow-emerald-950/50 ring-1 ring-emerald-500/50'
                        : 'bg-[#141728] border-[#29304a] text-slate-400 hover:text-slate-200 hover:border-[#374062]'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        formTipo === 'Entrada' ? 'bg-emerald-500/25 text-emerald-400' : 'bg-[#1e2338] text-slate-400'
                      }`}
                    >
                      <ArrowDownLeft className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-xs sm:text-sm text-emerald-400">Entrada</div>
                      <div className="text-[11px] text-slate-400">Receita no caixa</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormTipo('Saída')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                      formTipo === 'Saída'
                        ? 'bg-rose-500/15 border-rose-500 text-white shadow-sm shadow-rose-950/50 ring-1 ring-rose-500/50'
                        : 'bg-[#141728] border-[#29304a] text-slate-400 hover:text-slate-200 hover:border-[#374062]'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        formTipo === 'Saída' ? 'bg-rose-500/25 text-rose-400' : 'bg-[#1e2338] text-slate-400'
                      }`}
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-xs sm:text-sm text-rose-400">Saída</div>
                      <div className="text-[11px] text-slate-400">Despesa ou custo</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Valor e Data em duas colunas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Valor (R$) *</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold font-mono text-slate-400">
                      R$
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="0,00"
                      value={formValor}
                      onChange={(e) => setFormValor(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 bg-[#141728] border border-[#2b324d] rounded-xl text-sm font-bold font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Data da Movimentação *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData}
                    onChange={(e) => setFormData(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#141728] border border-[#2b324d] rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer transition-colors"
                  />
                </div>
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Categoria *</span>
                  <span className="text-[11px] text-slate-400 font-normal">Classificação contábil</span>
                </label>
                <select
                  value={formCategoria}
                  onChange={(e) => setFormCategoria(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#141728] border border-[#2b324d] rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer transition-colors"
                >
                  {categoriasDisponiveis.map((cat) => (
                    <option key={cat} value={cat} className="bg-[#181b2d] text-white">
                      {cat}
                    </option>
                  ))}
                  <option value="__NOVA__" className="bg-[#181b2d] text-indigo-300 font-semibold">
                    + Cadastrar outra categoria personalizada...
                  </option>
                </select>

                {formCategoria === '__NOVA__' && (
                  <input
                    type="text"
                    required
                    placeholder="Digite o nome da nova categoria..."
                    value={formNovaCategoria}
                    onChange={(e) => setFormNovaCategoria(e.target.value)}
                    className="mt-2 w-full px-3.5 py-2.5 bg-[#141728] border border-indigo-500/70 rounded-xl text-xs sm:text-sm text-white focus:outline-none placeholder-slate-500"
                    autoFocus
                  />
                )}
              </div>

              {/* Status da Movimentação */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Status da Movimentação *
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setFormStatus('CONFIRMADO')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                      formStatus === 'CONFIRMADO'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/60 ring-1 ring-emerald-500/30'
                        : 'bg-[#141728] text-slate-400 border-[#29304a] hover:text-slate-200'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Confirmado</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormStatus('PENDENTE')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                      formStatus === 'PENDENTE'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/60 ring-1 ring-amber-500/30'
                        : 'bg-[#141728] text-slate-400 border-[#29304a] hover:text-slate-200'
                    }`}
                  >
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span>Pendente</span>
                  </button>
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Observações / Detalhes (Opcional)
                </label>
                <textarea
                  rows={2.5}
                  placeholder="Ex: Doação de membro para reforma, Nota fiscal nº 104, etc."
                  value={formObservacoes}
                  onChange={(e) => setFormObservacoes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#141728] border border-[#2b324d] rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none transition-colors"
                />
              </div>

              {/* Botões do Rodapé */}
              <div className="pt-3.5 border-t border-[#262b44] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalNovoAberto(false)}
                  className="px-4.5 py-2.5 rounded-xl bg-[#22273c] hover:bg-[#2b324d] text-slate-300 hover:text-white border border-[#323955] text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="px-5.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-950/40 flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-all"
                >
                  {salvando ? <RotateCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>{itemParaEditar ? 'Atualizar Movimentação' : 'Salvar Movimentação'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* Modal: Confirmação de Exclusão */}
      {itemParaExcluir && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#1c2030] border border-rose-500/40 rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Excluir Lançamento?</h4>
                <p className="text-xs text-slate-400">Esta ação não pode ser desfeita.</p>
              </div>
            </div>

            <div className="bg-[#171a29] p-3 rounded-lg border border-[#2c324e] text-xs space-y-1">
              <p className="text-slate-300">
                <strong>Categoria:</strong> {itemParaExcluir.CategoriaFluxo}
              </p>
              <p className="text-slate-300">
                <strong>Tipo:</strong> {itemParaExcluir.TipoFluxo}
              </p>
              <p className="text-slate-300">
                <strong>Valor:</strong>{' '}
                <span className="font-mono font-bold text-white">{formatBRL(itemParaExcluir.ValorFluxo)}</span>
              </p>
              <p className="text-slate-300">
                <strong>Data:</strong>{' '}
                {itemParaExcluir.DataFluxo ? itemParaExcluir.DataFluxo.slice(0, 10) : '-'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                onClick={() => setItemParaExcluir(null)}
                disabled={excluindo}
                className="px-4 py-2 rounded-lg bg-[#252a40] hover:bg-[#313754] text-slate-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarExclusao}
                disabled={excluindo}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {excluindo && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Sim, Excluir</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
