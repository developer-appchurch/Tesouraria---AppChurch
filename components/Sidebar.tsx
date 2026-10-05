'use client';

import React from 'react';
import Image from 'next/image';
import {
  ClipboardCheck,
  FileSpreadsheet,
  LayoutDashboard,
  ShieldCheck,
  X,
  LogOut,
} from 'lucide-react';
import { ViewMode } from '@/lib/types';

interface SidebarProps {
  currentView: ViewMode;
  onSelectView: (view: ViewMode) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  pendingCount?: number;
  onLogout?: () => void;
  usuarioLogado?: import('@/lib/types').MembroItem | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  isMobileOpen = false,
  onCloseMobile,
  pendingCount = 0,
  onLogout,
  usuarioLogado,
}) => {
  const menuItems: {
    id: ViewMode;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    {
      id: 'validar-relatorios',
      label: 'Validar Relatórios',
      icon: ClipboardCheck,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    {
      id: 'relacao-envelopes',
      label: 'Relação Envelopes',
      icon: FileSpreadsheet,
    },
    {
      id: 'dashboard',
      label: 'DashBoard',
      icon: LayoutDashboard,
    },
    {
      id: 'permissoes',
      label: 'Permissões',
      icon: ShieldCheck,
    },
  ];

  const renderContent = (isMobile: boolean) => (
    <div className="flex flex-col h-full justify-between">
      <div>
        {/* Logo Brand Header Oficial - appchurch-tesouraria.webp */}
        <div className="px-4 py-4.5 border-b border-[#25293d] flex items-center justify-center relative select-none">
          <div className="w-full flex items-center justify-center">
            <Image
              src="/assets/appchurch-tesouraria.webp"
              alt="AppChurch Tesouraria"
              width={180}
              height={93}
              priority
              className="w-[42%] max-w-[110px] h-auto object-contain mx-auto select-none"
              referrerPolicy="no-referrer"
            />
          </div>
          {isMobile && (
            <button
              onClick={onCloseMobile}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#25293d] cursor-pointer"
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation Menu */}
        <nav className="px-3 py-4 space-y-1.5" aria-label="Navegação Principal">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (currentView !== item.id) {
                    onSelectView(item.id);
                  }
                  if (isMobile && onCloseMobile) {
                    onCloseMobile();
                  }
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium border text-left cursor-pointer transition-colors duration-150 select-none ${
                  isActive
                    ? 'bg-[#282d46] text-white shadow-xs border-[#3b4366]'
                    : 'border-transparent text-slate-300 hover:bg-[#202438] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors duration-150 ${
                      isActive ? 'text-indigo-300' : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer / Sessão & Logout */}
      <div id="sidebar-footer" className="p-3 border-t border-[#25293d] mt-auto space-y-2">
        {usuarioLogado && (
          <div className="px-2.5 py-1.5 rounded-lg bg-[#131522] border border-[#23273d] text-left">
            <p className="text-xs font-bold text-slate-200 truncate">{usuarioLogado.nome || usuarioLogado.login}</p>
            <p className="text-[10px] text-indigo-400 font-medium capitalize truncate">{usuarioLogado.cargo || usuarioLogado.role || 'Tesoureiro'}</p>
          </div>
        )}
        <button
          onClick={() => {
            if (onLogout) onLogout();
            else onSelectView('login');
            if (isMobile && onCloseMobile) onCloseMobile();
          }}
          className="w-full flex items-center justify-center py-2 px-3 rounded-lg text-xs font-semibold bg-[#1b1e2f] text-slate-300 hover:text-red-300 hover:bg-red-950/25 border border-[#2b3048] hover:border-red-900/50 cursor-pointer gap-2 transition-colors duration-150"
          title="Sair do Sistema"
        >
          <LogOut className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span>Sair</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex w-60 bg-[#181a28] text-slate-200 border-r border-[#2a2f48] flex-col justify-between select-none shrink-0 h-full overflow-y-auto">
        {renderContent(false)}
      </aside>

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] h-full bg-[#181a28] text-slate-200 border-r border-[#2a2f48] flex flex-col justify-between select-none z-10 shadow-2xl overflow-y-auto animate-in slide-in-from-left duration-200">
            {renderContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
