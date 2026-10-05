'use client';

import React from 'react';
import { Church, Loader2, Database, ShieldCheck } from 'lucide-react';

interface LoadingScreenProps {
  mensagem?: string;
  subtexto?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  mensagem = 'Carregando dados do Supabase...',
  subtexto = 'Sincronizando relatórios e permissões da igreja...',
}) => {
  return (
    <div
      id="app-loading-screen"
      className="min-h-screen w-full bg-[#161a29] text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden select-none"
    >
      {/* Luzes de fundo com blur suave */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Cartão Central */}
      <div className="relative z-10 flex flex-col items-center max-w-sm w-full text-center">
        {/* Ícone com Efeito Glow e Animação de Pulso */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#232a42] to-[#141828] border border-[#343e62] flex items-center justify-center text-white shadow-2xl shadow-indigo-950/60 relative z-10">
            <Church className="w-10 h-10 text-indigo-400 stroke-[1.8]" />
          </div>
          {/* Anel de Pulso */}
          <div className="absolute inset-0 rounded-3xl bg-indigo-500/20 animate-ping duration-1000 -z-0 pointer-events-none" />
        </div>

        {/* Título da Aplicação */}
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-1">
          AppChurch
        </h1>
        <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-6">
          ADM Tesouraria
        </p>

        {/* Barra de Progresso Animada */}
        <div className="w-full bg-[#20263c] rounded-full h-1.5 overflow-hidden mb-5 border border-[#2e3756]">
          <div className="h-full bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400 rounded-full w-full animate-pulse" />
        </div>

        {/* Mensagens de Carregamento */}
        <div className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-200 mb-1.5">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
          <span>{mensagem}</span>
        </div>

        <p className="text-xs text-slate-400 font-medium">
          {subtexto}
        </p>

        {/* Badges no Rodapé do Loader */}
        <div className="flex items-center justify-center gap-4 mt-8 text-[11px] text-slate-500 font-medium border-t border-[#232a42] pt-4 w-full">
          <span className="flex items-center gap-1">
            <Database className="w-3.5 h-3.5 text-emerald-500" />
            Supabase DB
          </span>
          <span className="text-[#2b3554]">•</span>
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            Acesso Seguro
          </span>
        </div>
      </div>
    </div>
  );
};
