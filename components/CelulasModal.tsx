'use client';

import React, { useState } from 'react';
import {
  X,
  Database,
  Users,
  Layers,
  ExternalLink,
} from 'lucide-react';
import { LISTA_CELULAS } from '@/lib/celulas-data';

interface CelulasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshData?: () => void;
  onShowToast?: (msg: string) => void;
}

export const CelulasModal: React.FC<CelulasModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [abaAtiva, setAbaAtiva] = useState<'celulas' | 'info'>('celulas');
  const [filtroSetor, setFiltroSetor] = useState<string>('todos');

  if (!isOpen) return null;

  const setores = Array.from(new Set(LISTA_CELULAS.map((c) => c.setor)));
  const celulasFiltradas =
    filtroSetor === 'todos'
      ? LISTA_CELULAS
      : LISTA_CELULAS.filter((c) => c.setor.toLowerCase() === filtroSetor.toLowerCase());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-[#181c2b] border border-[#2b3350] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[#2b3350] flex items-center justify-between bg-[#151825]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Células & Banco de Dados Supabase
              </h3>
              <p className="text-xs text-slate-400">
                Tabela <code className="text-indigo-300 font-mono">relatorios_semanais</code> (AppChurch)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#252a40] cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#2b3350] px-4 bg-[#181c2b] gap-2 overflow-x-auto">
          <button
            onClick={() => setAbaAtiva('celulas')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
              abaAtiva === 'celulas'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4 text-indigo-400" />
            <span>Células Cadastradas ({LISTA_CELULAS.length})</span>
          </button>
          <button
            onClick={() => setAbaAtiva('info')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
              abaAtiva === 'info'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>Estrutura do Banco (RLS & Integração)</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: CÉLULAS CADASTRADAS */}
          {abaAtiva === 'celulas' && (
            <div className="space-y-4">
              {/* Filter by Sector */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-400 font-semibold">Filtrar por Setor:</label>
                  <select
                    value={filtroSetor}
                    onChange={(e) => setFiltroSetor(e.target.value)}
                    className="bg-[#242940] border border-[#3b4366] text-white text-xs font-bold rounded-lg px-3 py-1.5 focus:outline-none cursor-pointer"
                  >
                    <option value="todos">Todos os 10 Setores ({LISTA_CELULAS.length} Células)</option>
                    {setores.map((s) => (
                      <option key={s} value={s}>
                        Setor {s} ({LISTA_CELULAS.filter((c) => c.setor === s).length} células)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-xs text-slate-400">
                  Mostrando <strong className="text-white">{celulasFiltradas.length}</strong> células
                </div>
              </div>

              {/* Grid of Cells */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {celulasFiltradas.map((cel) => (
                  <div
                    key={cel.id}
                    className="p-3.5 rounded-xl bg-[#1f2438] border border-[#2e3655] hover:border-indigo-500/50 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-800/40">
                          {cel.setor}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">{cel.bairro}</span>
                      </div>
                      <h4 className="font-bold text-sm text-white">{cel.nome}</h4>
                      <p className="text-xs text-slate-300 mt-1">
                        <span className="text-slate-400">Líder:</span> <strong>{cel.lider}</strong>
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-[#2a304a] text-[11px] text-slate-400 flex items-center justify-between">
                      <span>{cel.diaEncontro}</span>
                      <span className="font-mono text-indigo-300">{cel.horario}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: INFORMAÇÕES DE INTEGRAÇÃO */}
          {abaAtiva === 'info' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-[#1f2438] border border-[#2e3655] space-y-3">
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-400" />
                  Arquitetura de Dados & Segurança (RLS)
                </h4>
                <p className="text-slate-300 leading-relaxed">
                  Este módulo de Tesouraria é integrado diretamente ao banco de dados do <strong>AppChurch</strong>.
                  Todas as consultas na tabela <code className="text-indigo-300 font-mono">relatorios_semanais</code> são filtradas
                  automaticamente pelo Row Level Security (RLS) no Supabase de acordo com a igreja do usuário autenticado.
                </p>

                <div className="bg-[#141724] p-3 rounded-lg border border-[#2c334f] space-y-2 font-mono text-[11px] text-slate-300">
                  <div><strong>API de Autenticação:</strong> POST https://app.appchurch.com.br/api/tesouraria/login</div>
                  <div><strong>Supabase Project:</strong> srjkwwddbxniqhzqvrhc.supabase.co</div>
                  <div><strong>Controle de Acesso:</strong> Homologação e validações controladas via RLS no backend.</div>
                </div>

                <div className="pt-2">
                  <a
                    href="https://supabase.com/dashboard/project/srjkwwddbxniqhzqvrhc"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 hover:underline"
                  >
                    <span>Abrir Dashboard do Supabase</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
