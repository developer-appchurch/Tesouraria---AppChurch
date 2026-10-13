'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';

interface BotaoExportarProps {
  onPdf: () => Promise<void>;
  onExcel: () => Promise<void>;
  onErro?: (msg: string) => void;
  desabilitado?: boolean;
  /** Visual claro para fundos escuros (padrão) */
  className?: string;
}

/** Botão "Exportar" com opções PDF e Excel. */
export const BotaoExportar: React.FC<BotaoExportarProps> = ({ onPdf, onExcel, onErro, desabilitado, className = '' }) => {
  const [aberto, setAberto] = useState(false);
  const [gerando, setGerando] = useState<'pdf' | 'excel' | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [aberto]);

  const gerar = async (tipo: 'pdf' | 'excel') => {
    setAberto(false);
    setGerando(tipo);
    try {
      await (tipo === 'pdf' ? onPdf() : onExcel());
    } catch (e: any) {
      console.warn('[Exportar] Falha:', e);
      onErro?.(`Não foi possível gerar o ${tipo === 'pdf' ? 'PDF' : 'Excel'}. Tente novamente.`);
    } finally {
      setGerando(null);
    }
  };

  return (
    <div className={`relative ${className}`} ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        disabled={desabilitado || gerando !== null}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#252a40] hover:bg-[#313754] text-slate-200 hover:text-white border border-[#394164] text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        title="Exportar em PDF ou Excel"
        aria-haspopup="menu"
        aria-expanded={aberto}
      >
        {gerando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        <span>{gerando ? 'Gerando...' : 'Exportar'}</span>
      </button>
      {aberto && (
        <div
          role="menu"
          className="absolute right-0 mt-1.5 z-40 w-44 bg-[#1c2030] border border-[#394164] rounded-lg shadow-xl overflow-hidden"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => gerar('pdf')}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-200 hover:bg-[#2b314c] hover:text-white cursor-pointer"
          >
            <FileText className="w-4 h-4 text-rose-400" />
            PDF
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => gerar('excel')}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-200 hover:bg-[#2b314c] hover:text-white cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            Excel (.xlsx)
          </button>
        </div>
      )}
    </div>
  );
};
