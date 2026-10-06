'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Trash2,
  Check,
  RotateCw,
  Loader2,
  ShieldCheck,
  UserCheck,
  AlertCircle,
} from 'lucide-react';
import { TesourariaPermissaoItem, MembroBuscaItem, PermissaoUsuario } from '@/lib/types';
import { TreasuryService } from '@/lib/treasury-service';

interface PermissoesViewProps {
  usuarios?: PermissaoUsuario[];
  onRefresh?: () => void;
  onShowToast: (msg: string) => void;
}

export const PermissoesView: React.FC<PermissoesViewProps> = ({
  onRefresh,
  onShowToast,
}) => {
  // Lista de permissões atuais na tabela tesouraria_permissao
  const [permissoes, setPermissoes] = useState<TesourariaPermissaoItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [filtroAutorizados, setFiltroAutorizados] = useState<string>('');

  // Busca e inclusão de novos membros da tabela membros
  const [termoBuscaMembro, setTermoBuscaMembro] = useState<string>('');
  const [membrosEncontrados, setMembrosEncontrados] = useState<MembroBuscaItem[]>([]);
  const [isBuscandoMembros, setIsBuscandoMembros] = useState<boolean>(false);
  const [isAdicionandoId, setIsAdicionandoId] = useState<string | null>(null);
  const [isRemovendoId, setIsRemovendoId] = useState<string | null>(null);

  // Confirmação de exclusão
  const [membroParaRemover, setMembroParaRemover] = useState<TesourariaPermissaoItem | null>(null);

  // Carrega permissões atuais da tesouraria
  const carregarPermissoes = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await TreasuryService.fetchTesourariaPermissoes();
      if (res.success && res.data) {
        setPermissoes(res.data);
      } else if (res.error) {
        onShowToast(res.error);
      }
    } catch (e: any) {
      console.warn('Erro ao carregar permissões:', e);
      onShowToast('Erro ao carregar lista de permissões.');
    } finally {
      setIsLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    let isCancelled = false;
    const fetchPerms = async () => {
      try {
        const res = await TreasuryService.fetchTesourariaPermissoes();
        if (!isCancelled && res.success && res.data) {
          setPermissoes(res.data);
        } else if (!isCancelled && res.error) {
          onShowToast(res.error);
        }
      } catch (e: any) {
        if (!isCancelled) {
          console.warn('Erro ao carregar permissões:', e);
          onShowToast('Erro ao carregar lista de permissões.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };
    fetchPerms();
    return () => {
      isCancelled = true;
    };
  }, [onShowToast]);

  // Busca membros no banco com debounce
  useEffect(() => {
    const termo = termoBuscaMembro.trim();
    if (!termo) return;

    let isCancelled = false;
    const timer = setTimeout(async () => {
      setIsBuscandoMembros(true);
      try {
        const res = await TreasuryService.buscarMembrosIgreja(termo);
        if (!isCancelled && res.success && res.data) {
          setMembrosEncontrados(res.data);
        } else if (!isCancelled) {
          setMembrosEncontrados([]);
        }
      } catch (e) {
        console.warn('Erro na busca de membros:', e);
      } finally {
        if (!isCancelled) {
          setIsBuscandoMembros(false);
        }
      }
    }, 300);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [termoBuscaMembro]);

  // Conjunto de membro_ids já com permissão concedida
  const membroIdsAutorizadosSet = useMemo(() => {
    return new Set(permissoes.map((p) => String(p.membro_id)));
  }, [permissoes]);

  // Filtro de pesquisa na lista de autorizados
  const autorizadosFiltrados = useMemo(() => {
    const f = filtroAutorizados.toLowerCase().trim();
    if (!f) return permissoes;
    return permissoes.filter(
      (p) =>
        p.nome.toLowerCase().includes(f) ||
        (p.funcao && p.funcao.toLowerCase().includes(f)) ||
        (p.email && p.email.toLowerCase().includes(f))
    );
  }, [permissoes, filtroAutorizados]);

  // Ação: Adicionar membro à tabela tesouraria_permissao
  const handleAdicionarMembro = async (membro: MembroBuscaItem) => {
    setIsAdicionandoId(membro.id);
    try {
      const res = await TreasuryService.adicionarPermissaoTesouraria(membro.id);
      if (res.success) {
        onShowToast(`Acesso concedido para ${membro.nome}!`);
        // Adiciona otimista
        setPermissoes((prev) => [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            membro_id: membro.id,
            nome: membro.nome,
            funcao: membro.funcao || 'Membro',
            email: membro.email || '',
            criado_em: new Date().toISOString(),
          },
        ]);
        // Recarrega dados reais
        await carregarPermissoes();
        onRefresh?.();
      } else {
        onShowToast(`Não foi possível conceder acesso: ${res.error || res.message}`);
      }
    } catch (e: any) {
      onShowToast(`Erro ao conceder acesso: ${e?.message || 'Falha no servidor'}`);
    } finally {
      setIsAdicionandoId(null);
    }
  };

  // Ação: Remover membro da tabela tesouraria_permissao
  const handleConfirmarRemover = async () => {
    if (!membroParaRemover) return;
    const item = membroParaRemover;
    setIsRemovendoId(item.id);
    try {
      const res = await TreasuryService.removerPermissaoTesouraria({
        id: item.id.startsWith('temp-') ? undefined : item.id,
        membro_id: item.membro_id,
      });

      if (res.success) {
        onShowToast(`Acesso de ${item.nome} removido com sucesso.`);
        setPermissoes((prev) => prev.filter((p) => p.membro_id !== item.membro_id && p.id !== item.id));
        setMembroParaRemover(null);
        await carregarPermissoes();
        onRefresh?.();
      } else {
        onShowToast(`Erro ao remover permissão: ${res.error}`);
      }
    } catch (e: any) {
      onShowToast(`Erro ao remover permissão: ${e?.message}`);
    } finally {
      setIsRemovendoId(null);
    }
  };

  return (
    <div className="p-3.5 sm:p-6 space-y-5 max-w-[1400px] mx-auto text-slate-100">
      {/* BLOCO 1: PESQUISAR E ADICIONAR NOVO MEMBRO */}
      <div className="bg-[#1b2033] border border-[#2d3654] rounded-xl p-4 sm:p-5 shadow-lg space-y-3">
        <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
          <UserPlus className="w-5 h-5 text-indigo-400" />
          <span>Adicionar Novo Membro com Acesso</span>
        </div>
        <p className="text-xs text-slate-400">
          Pesquise o nome do membro cadastrado na igreja para conceder acesso imediato ao aplicativo da Tesouraria.
        </p>

        {/* Campo de Busca de Membros */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Digite o nome do membro para buscar..."
            value={termoBuscaMembro}
            onChange={(e) => {
              const val = e.target.value;
              setTermoBuscaMembro(val);
              if (!val.trim()) {
                setMembrosEncontrados([]);
                setIsBuscandoMembros(false);
              }
            }}
            className="w-full bg-[#111628] border border-[#2b3558] text-sm text-white pl-10 pr-10 py-2.5 rounded-lg focus:outline-none focus:border-indigo-400 placeholder:text-slate-500 shadow-inner"
          />
          {isBuscandoMembros && (
            <Loader2 className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-indigo-400" />
          )}
        </div>

        {/* Resultados da Busca */}
        {termoBuscaMembro.trim().length > 0 && (
          <div className="mt-2 bg-[#12172b] border border-[#263155] rounded-lg overflow-hidden max-h-64 overflow-y-auto divide-y divide-[#1e2642]">
            {isBuscandoMembros && membrosEncontrados.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                <span>Buscando membros na igreja...</span>
              </div>
            ) : membrosEncontrados.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                Nenhum membro encontrado com o nome &ldquo;{termoBuscaMembro}&rdquo;.
              </div>
            ) : (
              membrosEncontrados.map((m) => {
                const jaPossuiAcesso = membroIdsAutorizadosSet.has(String(m.id));
                const isCarregandoEste = isAdicionandoId === m.id;

                return (
                  <div
                    key={m.id}
                    className="p-3 flex items-center justify-between gap-3 hover:bg-[#181f3a] transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-white truncate">{m.nome}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="px-2 py-0.5 rounded bg-[#1c2444] text-indigo-300 text-[11px] font-semibold border border-[#2d3b66]">
                          {m.funcao || 'Membro'}
                        </span>
                        {m.email && <span className="truncate text-slate-500">{m.email}</span>}
                      </div>
                    </div>

                    <div>
                      {jaPossuiAcesso ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Já Autorizado</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAdicionarMembro(m)}
                          disabled={isCarregandoEste}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isCarregandoEste ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <UserPlus className="w-3.5 h-3.5" />
                          )}
                          <span>Conceder Acesso</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* BLOCO 2: LISTA DE MEMBROS ATUALMENTE AUTORIZADOS */}
      <div className="bg-[#1b2033] border border-[#2d3654] rounded-xl overflow-hidden shadow-lg space-y-0">
        <div className="p-4 sm:p-5 border-b border-[#263155] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-bold text-white">
                Membros com Acesso Autorizado
              </h2>
              <p className="text-xs text-slate-400">
                Total de {permissoes.length} {permissoes.length === 1 ? 'membro cadastrado' : 'membros cadastrados'} na tabela <code className="text-slate-300 font-mono text-[11px]">tesouraria_permissao</code>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {/* Campo de Filtro da Lista */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrar por nome ou função..."
                value={filtroAutorizados}
                onChange={(e) => setFiltroAutorizados(e.target.value)}
                className="w-full bg-[#111628] border border-[#263155] text-xs text-white pl-8 pr-3 py-1.5 rounded-lg focus:outline-none focus:border-indigo-400 placeholder:text-slate-500"
              />
            </div>

            <button
              onClick={() => {
                carregarPermissoes();
                onRefresh?.();
              }}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111628] border border-[#263155] hover:border-indigo-500/50 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-xs active:scale-[0.98] shrink-0"
              title="Recarregar permissões"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
          </div>
        </div>

        {/* Tabela de Membros Autorizados */}
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-xs text-left min-w-[600px]">
            <thead className="bg-[#111628] text-slate-300 uppercase tracking-wider text-[11px] border-b border-[#263155]">
              <tr>
                <th className="px-5 py-3.5 font-bold">MEMBRO</th>
                <th className="px-4 py-3.5 font-bold">FUNÇÃO (TABELA MEMBROS)</th>
                <th className="px-4 py-3.5 font-bold text-center">STATUS</th>
                <th className="px-5 py-3.5 font-bold text-center w-36">AÇÃO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#263155]">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-slate-400 text-sm bg-[#141a2e]">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                      <span>Carregando membros autorizados...</span>
                    </div>
                  </td>
                </tr>
              ) : autorizadosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-slate-400 text-sm bg-[#141a2e]">
                    {filtroAutorizados
                      ? 'Nenhum membro autorizado corresponde à busca.'
                      : 'Nenhum membro possui permissão de acesso cadastrada na tesouraria.'}
                  </td>
                </tr>
              ) : (
                autorizadosFiltrados.map((item) => {
                  return (
                    <tr
                      key={item.id}
                      className="bg-[#171d33] hover:bg-[#1d2540] transition-colors text-slate-200"
                    >
                      {/* Nome do Membro */}
                      <td className="px-5 py-3.5 font-bold text-white text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-black text-xs shrink-0">
                            {item.nome.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="block truncate">{item.nome}</span>
                            {item.email && (
                              <span className="block text-[11px] font-normal text-slate-400 truncate">
                                {item.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Função do Membro */}
                      <td className="px-4 py-3.5 font-semibold text-slate-300">
                        <span className="px-2.5 py-1 rounded-md bg-[#222a48] text-slate-200 text-xs border border-[#313c66]">
                          {item.funcao || 'Membro'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          Acesso Ativo
                        </span>
                      </td>

                      {/* Ação: Remover Permissão */}
                      <td className="px-5 py-3.5 text-center">
                        <button
                          onClick={() => setMembroParaRemover(item)}
                          disabled={isRemovendoId === item.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 hover:text-rose-200 border border-rose-500/40 text-xs font-bold transition-all cursor-pointer active:scale-95"
                          title="Remover acesso deste membro à tesouraria"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remover Acesso</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Confirmação de Remoção de Acesso */}
      {membroParaRemover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[#1b2033] border border-[#2d3654] rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-2xl text-slate-100 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Remover Acesso à Tesouraria</h3>
                <p className="text-xs text-slate-400 mt-0.5">Esta ação revogará a permissão do usuário.</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#12172b] border border-[#263155] text-xs text-slate-300 space-y-1">
              <div>
                <strong className="text-white">Membro:</strong> {membroParaRemover.nome}
              </div>
              <div>
                <strong className="text-white">Função:</strong> {membroParaRemover.funcao || 'Membro'}
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Tem certeza que deseja excluir este usuário da tabela <code className="text-rose-300 font-mono text-[11px]">tesouraria_permissao</code>? Ele deixará de ter acesso ao aplicativo.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setMembroParaRemover(null)}
                className="px-3.5 py-2 rounded-lg bg-[#242b45] hover:bg-[#2d3656] text-slate-300 text-xs font-bold cursor-pointer transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarRemover}
                disabled={isRemovendoId !== null}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md cursor-pointer transition-all disabled:opacity-50"
              >
                {isRemovendoId !== null ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Confirmar e Remover</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
