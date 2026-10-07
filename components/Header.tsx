'use client';

import React, { useMemo, useEffect } from 'react';
import { RotateCw, Menu } from 'lucide-react';
import { ViewMode, LancamentoTesouraria } from '@/lib/types';

interface HeaderProps {
  currentView: ViewMode;
  anoSelecionado: number | string;
  onSelectAno: (ano: number | string) => void;
  lancamentos?: LancamentoTesouraria[];
  onRefresh: () => void;
  isRefreshing: boolean;
  onToggleMobileMenu?: () => void;
  mesSelecionado?: string;
  onSelectMes?: (mes: string) => void;
  setorSelecionado?: string;
  onSelectSetor?: (setor: string) => void;
  setoresDisponiveis?: string[];
  onShowToast?: (msg: string) => void;
}

const MESES_HEADER = [
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


export const Header: React.FC<HeaderProps> = ({
  currentView,
  anoSelecionado,
  onSelectAno,
  lancamentos = [],
  onRefresh,
  isRefreshing,
  onToggleMobileMenu,
  mesSelecionado,
  onSelectMes,
  setorSelecionado,
  onSelectSetor,
  setoresDisponiveis = [],
  onShowToast,
}) => {
  const anosDisponiveis = useMemo(() => {
    const anosSet = new Set<number>();
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

    if (anosSet.size === 0) {
      anosSet.add(new Date().getFullYear());
    }
    return Array.from(anosSet).sort((a, b) => b - a);
  }, [lancamentos]);

  // Se for o ano atual, exibe apenas até o mês mais recente (mês atual)
  const mesesDisponiveis = useMemo(() => {
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth() + 1;

    const isAnoAtual =
      anoSelecionado === 'todos' ||
      Number(anoSelecionado) === anoAtual ||
      String(anoSelecionado) === String(anoAtual);

    if (isAnoAtual) {
      return MESES_HEADER.filter((m) => Number(m.valor) <= mesAtual);
    }

    return MESES_HEADER;
  }, [anoSelecionado]);

  // Lista de setores válidos (sem a opção "todos")
  const listaSetores = useMemo(() => {
    return setoresDisponiveis.filter(
      (s) => s && s.toLowerCase() !== 'todos' && s.toLowerCase() !== 'todos os setores'
    );
  }, [setoresDisponiveis]);

  // Auto-seleciona sempre o mês atual (ou último mês disponível válido, nunca 'todos')
  useEffect(() => {
    if (onSelectMes && mesesDisponiveis.length > 0) {
      const mesAtualStr = String(new Date().getMonth() + 1);
      const isValido = mesSelecionado && mesSelecionado !== 'todos' && mesesDisponiveis.some((m) => m.valor === mesSelecionado);
      if (!isValido) {
        const temAtual = mesesDisponiveis.some((m) => m.valor === mesAtualStr);
        onSelectMes(temAtual ? mesAtualStr : mesesDisponiveis[mesesDisponiveis.length - 1].valor);
      }
    }
  }, [mesSelecionado, mesesDisponiveis, onSelectMes]);

  // Auto-seleciona sempre o primeiro setor (nunca 'todos')
  useEffect(() => {
    if (onSelectSetor && listaSetores.length > 0) {
      const isValido =
        setorSelecionado &&
        setorSelecionado.toLowerCase() !== 'todos' &&
        setorSelecionado.toLowerCase() !== 'todos os setores' &&
        listaSetores.includes(setorSelecionado);

      if (!isValido) {
        onSelectSetor(listaSetores[0]);
      }
    }
  }, [setorSelecionado, listaSetores, onSelectSetor]);

  const getTitle = () => {
    switch (currentView) {
      case 'dashboard':
        return 'DashBoard | Ofertas Célula';
      case 'relacao-envelopes':
        return 'Relação de Envelopes';
      case 'validar-relatorios':
        return 'Validar Entrega de Envelope';
      case 'permissoes':
        return 'Permissões de Acesso ao App';
      default:
        return 'Tesouraria AppChurch';
    }
  };

  return (
    <>
      <header className="bg-[#1c2030] text-slate-100 px-3.5 sm:px-6 py-3 border-b border-[#2a2f48] flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          {onToggleMobileMenu && (
            <button
              onClick={onToggleMobileMenu}
              className="md:hidden p-1.5 -ml-1 rounded-lg text-slate-300 hover:text-white hover:bg-[#282e48] transition-colors cursor-pointer"
              aria-label="Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <div>
            <p className="text-[11px] sm:text-xs text-slate-400 font-medium">
              Tesouraria Geral
            </p>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                {getTitle()}
              </h2>
            </div>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center flex-wrap gap-2 ml-auto">
          {/* Filters for Relação Envelopes */}
          {currentView === 'relacao-envelopes' && (
            <>
              {/* 1. Ano */}
              <div className="flex items-center gap-1 bg-[#252a40] px-2.5 py-1 rounded-lg border border-[#394164]">
                <label className="text-xs text-slate-300 font-medium">Ano:</label>
                <select
                  value={anoSelecionado}
                  onChange={(e) =>
                    onSelectAno(e.target.value === 'todos' ? 'todos' : Number(e.target.value))
                  }
                  className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
                >
                  <option value="todos" className="bg-[#1c2030] text-white">
                    Todos os Anos
                  </option>
                  {anosDisponiveis.map((ano) => (
                    <option key={ano} value={ano} className="bg-[#1c2030] text-white">
                      {ano}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Mês */}
              {onSelectMes && (
                <div className="flex items-center gap-1 bg-[#252a40] px-2.5 py-1 rounded-lg border border-[#394164]">
                  <label className="text-xs text-slate-300 font-medium">Mês:</label>
                  <select
                    value={
                      !mesSelecionado || mesSelecionado === 'todos'
                        ? String(new Date().getMonth() + 1)
                        : mesSelecionado
                    }
                    onChange={(e) => onSelectMes(e.target.value)}
                    className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
                  >
                    {mesesDisponiveis.map((m) => (
                      <option key={m.valor} value={m.valor} className="bg-[#1c2030] text-white">
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 3. Setor */}
              {onSelectSetor && (
                <div className="flex items-center gap-1 bg-[#252a40] px-2.5 py-1 rounded-lg border border-[#394164]">
                  <label className="text-xs text-slate-300 font-medium">Setor:</label>
                  <select
                    value={
                      !setorSelecionado || setorSelecionado.toLowerCase() === 'todos' || setorSelecionado.toLowerCase() === 'todos os setores'
                        ? listaSetores[0] || ''
                        : setorSelecionado
                    }
                    onChange={(e) => onSelectSetor(e.target.value)}
                    className="bg-white text-xs font-bold text-slate-900 px-1.5 py-0.5 rounded focus:outline-none cursor-pointer shadow-xs"
                  >
                    {listaSetores.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {/* Refresh Sync Button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-[#252a40] hover:bg-[#313754] text-slate-300 hover:text-white border border-[#394164] transition-colors cursor-pointer"
            title="Sincronizar com o banco Supabase"
          >
            <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </header>
    </>
  );
};
