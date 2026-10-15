'use client';

import React, { useState } from 'react';
import { X, Download, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import type { LancamentoTesouraria, UnidadeCadastrada } from '@/lib/types';
import { TreasuryService } from '@/lib/treasury-service';
import { montarGradeEnvelopes, ehTodosSetores } from '@/lib/envelopes';
import type { DadosEnvelopes } from '@/lib/exportar';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const TODOS_SETORES = '__todos__';

type Situacao = 'todos' | 'validados' | 'pendentes';
type Formato = 'pdf' | 'excel';

interface ExportarEnvelopesModalProps {
  aberto: boolean;
  onFechar: () => void;
  /** Filtros da tela: vêm pré-selecionados */
  anoInicial: number | string;
  mesInicial?: string;
  setorInicial?: string;
  anos: number[];
  setores: string[];
  /** Lançamentos já carregados para o ano da tela (outro ano é buscado ao exportar) */
  lancamentos: LancamentoTesouraria[];
  unidades: UnidadeCadastrada[];
  igrejaNome?: string | null;
  usuarioNome?: string | null;
  onShowToast?: (msg: string) => void;
}

function anoNumero(ano: number | string): number {
  const n = Number(ano);
  return n > 2000 ? n : new Date().getFullYear();
}

export const ExportarEnvelopesModal: React.FC<ExportarEnvelopesModalProps> = ({
  aberto,
  onFechar,
  anoInicial,
  mesInicial,
  setorInicial,
  anos,
  setores,
  lancamentos,
  unidades,
  igrejaNome,
  usuarioNome,
  onShowToast,
}) => {
  const [ano, setAno] = useState<number>(() => anoNumero(anoInicial));
  const [mes, setMes] = useState<string>(() => (mesInicial && mesInicial !== 'todos' ? mesInicial : String(new Date().getMonth() + 1)));
  const [setor, setSetor] = useState<string>(() => (setorInicial && !ehTodosSetores(setorInicial) ? setorInicial : TODOS_SETORES));
  const [situacao, setSituacao] = useState<Situacao>('todos');
  const [formato, setFormato] = useState<Formato>('pdf');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!aberto) return null;

  const hoje = new Date();
  const ultimoMes = ano === hoje.getFullYear() ? hoje.getMonth() + 1 : 12;
  const mesesDoAno = Array.from({ length: ultimoMes }, (_, i) => i + 1);
  const listaAnos = Array.from(new Set([...anos, anoNumero(anoInicial)])).sort((a, b) => b - a);

  const exportar = async () => {
    setErro(null);
    setGerando(true);
    try {
      // Mesmo ano da tela: usa o que já está carregado. Outro ano: uma leitura (com cache)
      let base = lancamentos;
      if (ano !== anoNumero(anoInicial)) {
        const res = await TreasuryService.fetchRelatorios(false, ano);
        if (res.error) throw new Error(res.error);
        base = res.data || [];
      }

      const setorFiltro = setor === TODOS_SETORES ? 'todos' : setor;
      const rotuloSetor = setor === TODOS_SETORES ? 'Todos os setores' : setor;
      const rotuloSituacao = situacao === 'todos' ? 'Validados e pendentes' : situacao === 'validados' ? 'Somente validados' : 'Somente pendentes';
      const meses = mes === 'todos' ? mesesDoAno : [Number(mes)];

      const grades: DadosEnvelopes[] = meses.map((m) => {
        const g = montarGradeEnvelopes({ lancamentos: base, unidades, ano, mes: m, setor: setorFiltro });
        let linhas = g.celulas.map((c, ci) => ({
          setor: c.setor,
          celula: c.nome,
          lider: c.lider,
          semanas: g.valores[ci].map((v) => {
            const ok =
              situacao === 'todos' || (situacao === 'validados' ? v.validadoTesouraria : !v.validadoTesouraria);
            return {
              temDado: v.temDado,
              validado: v.validadoTesouraria,
              pix: Number(v.pix ?? 0),
              especie: Number(v.dinheiro ?? 0),
              filtrado: v.temDado && !ok,
            };
          }),
        }));
        // Com filtro de situação, só entram células com pelo menos uma semana na situação escolhida
        if (situacao !== 'todos') linhas = linhas.filter((l) => l.semanas.some((s) => s.temDado && !s.filtrado));
        return {
          cab: {
            igreja: igrejaNome || null,
            titulo: 'Relação de Envelopes',
            periodo: `${MESES[m - 1]} de ${ano}`,
            filtros: `Setor: ${rotuloSetor} · ${rotuloSituacao}`,
            geradoPor: usuarioNome || null,
          },
          semanas: g.semanas.map((s) => ({ num: s.num, data: s.data })),
          linhas,
          nomeAba: `${MESES[m - 1]} ${ano}`,
        };
      });

      const nomeBase = `envelopes ${mes === 'todos' ? `ano ${ano}` : `${MESES[Number(mes) - 1]} ${ano}`} ${rotuloSetor}${
        situacao === 'todos' ? '' : ` ${situacao}`
      }`;
      const mod = await import('@/lib/exportar');
      if (formato === 'pdf') await mod.exportarEnvelopesPdf(grades, nomeBase);
      else await mod.exportarEnvelopesExcel(grades, nomeBase);
      onShowToast?.(`${formato === 'pdf' ? 'PDF' : 'Excel'} gerado com sucesso.`);
      onFechar();
    } catch (e: any) {
      console.warn('[Exportar envelopes] Falha:', e);
      setErro(e?.message ? `Não foi possível exportar: ${e.message}` : 'Não foi possível exportar. Tente novamente.');
    } finally {
      setGerando(false);
    }
  };

  const campo = 'w-full px-3 py-2 bg-[#141728] border border-[#2b324d] rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer';
  const opcao = (ativo: boolean) =>
    `flex-1 px-3 py-2 rounded-lg border text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
      ativo ? 'bg-indigo-500/15 border-indigo-500 text-white ring-1 ring-indigo-500/40' : 'bg-[#141728] border-[#29304a] text-slate-400 hover:text-slate-200'
    }`;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={() => !gerando && onFechar()}
    >
      <div
        className="bg-[#1a1d2e] border border-[#2d3450] rounded-2xl shadow-2xl w-full max-w-md text-slate-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Exportar relação de envelopes"
      >
        <div className="p-4 border-b border-[#262b44] flex items-center justify-between bg-[#1f243b]">
          <div>
            <h3 className="text-base font-bold text-white">Exportar Relação de Envelopes</h3>
            <p className="text-xs text-slate-400 mt-0.5">Escolha o período, o setor e o formato</p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={gerando}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#282f4c] cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {erro && <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs">{erro}</div>}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-300 mb-1.5">Ano</span>
              <select
                value={ano}
                onChange={(e) => {
                  const novo = Number(e.target.value);
                  setAno(novo);
                  // Mês futuro não existe no ano atual
                  const limite = novo === hoje.getFullYear() ? hoje.getMonth() + 1 : 12;
                  if (mes !== 'todos' && Number(mes) > limite) setMes(String(limite));
                }}
                className={campo}
              >
                {listaAnos.map((a) => (
                  <option key={a} value={a} className="bg-[#181b2d]">
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-300 mb-1.5">Mês</span>
              <select value={mes} onChange={(e) => setMes(e.target.value)} className={campo}>
                <option value="todos" className="bg-[#181b2d]">
                  Todos os meses
                </option>
                {mesesDoAno.map((m) => (
                  <option key={m} value={String(m)} className="bg-[#181b2d]">
                    {MESES[m - 1]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold text-slate-300 mb-1.5">Setor</span>
            <select value={setor} onChange={(e) => setSetor(e.target.value)} className={campo}>
              <option value={TODOS_SETORES} className="bg-[#181b2d]">
                Todos os setores
              </option>
              {setores.map((s) => (
                <option key={s} value={s} className="bg-[#181b2d]">
                  {s}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="block text-xs font-semibold text-slate-300 mb-1.5">Situação</span>
            <div className="flex gap-2">
              <button type="button" className={opcao(situacao === 'todos')} onClick={() => setSituacao('todos')}>
                Todos
              </button>
              <button type="button" className={opcao(situacao === 'validados')} onClick={() => setSituacao('validados')}>
                Validados
              </button>
              <button type="button" className={opcao(situacao === 'pendentes')} onClick={() => setSituacao('pendentes')}>
                Pendentes
              </button>
            </div>
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-300 mb-1.5">Formato</span>
            <div className="flex gap-2">
              <button type="button" className={opcao(formato === 'pdf')} onClick={() => setFormato('pdf')}>
                <FileText className="w-4 h-4 text-rose-400" /> PDF
              </button>
              <button type="button" className={opcao(formato === 'excel')} onClick={() => setFormato('excel')}>
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Excel
              </button>
            </div>
            {mes === 'todos' && (
              <p className="text-[11px] text-slate-400 mt-1.5">
                Todos os meses: {formato === 'pdf' ? 'uma página por mês' : 'uma aba por mês'}.
              </p>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-[#262b44] flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onFechar}
            disabled={gerando}
            className="px-4 py-2 rounded-lg bg-[#22273c] hover:bg-[#2b324d] text-slate-300 border border-[#323955] text-xs font-semibold cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={exportar}
            disabled={gerando}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {gerando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {gerando ? 'Gerando...' : 'Exportar'}
          </button>
        </div>
      </div>
    </div>
  );
};
