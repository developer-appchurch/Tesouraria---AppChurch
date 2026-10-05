'use client';

import React from 'react';
import { Database, CheckCircle2, ShieldCheck, RefreshCw, FileText, Mail, BarChart3, Users } from 'lucide-react';

export type ScreenTab = 'validar' | 'envelopes' | 'dashboard' | 'permissoes';

interface HeaderProps {
  currentTab: ScreenTab;
  onTabChange: (tab: ScreenTab) => void;
  pendingValidationCount: number;
  onRefreshData: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onTabChange,
  pendingValidationCount,
  onRefreshData,
  isRefreshing,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Zone 1: Single text element Brand Wordmark */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600/90 text-white flex items-center justify-center font-bold text-sm tracking-wider shadow-inner">
              <ShieldCheck className="w-5 h-5 text-emerald-100" />
            </div>
            <div>
              <span className="text-base sm:text-lg font-bold tracking-tight text-white block">
                Tesouraria Geral
              </span>
              <span className="text-[11px] text-slate-400 font-normal">
                Igreja Evangélica · Gestão Financeira
              </span>
            </div>
          </div>

          {/* Zone 2: 4 Navigation tabs (Single-line, clean clickable controls) */}
          <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1">
            <button
              onClick={() => onTabChange('validar')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                currentTab === 'validar'
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>Validar Relatórios</span>
              {pendingValidationCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-slate-950 font-bold text-[10px] rounded-full">
                  {pendingValidationCount}
                </span>
              )}
            </button>

            <button
              onClick={() => onTabChange('envelopes')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                currentTab === 'envelopes'
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Mail className="w-4 h-4 shrink-0" />
              <span>Relação Envelopes</span>
            </button>

            <button
              onClick={() => onTabChange('dashboard')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                currentTab === 'dashboard'
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => onTabChange('permissoes')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                currentTab === 'permissoes'
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Permissões</span>
            </button>
          </nav>

          {/* Zone 3: Actions (Refresh & Supabase status indicator) */}
          <div className="flex items-center gap-2">
            <button
              onClick={onRefreshData}
              disabled={isRefreshing}
              title="Atualizar dados do Supabase"
              className="flex items-center gap-1.5 px-3 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-xs font-medium border border-slate-700/60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>

            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-950/70 text-emerald-300 border border-emerald-700/80">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>relatorios_semanais</span>
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
