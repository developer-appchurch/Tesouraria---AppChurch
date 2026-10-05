'use client';

import React, { useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Check,
  X,
  Lock,
  Unlock,
  Mail,
  Edit2,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { PermissaoUsuario, PerfilAcesso } from '@/lib/types';
import { TreasuryService } from '@/lib/treasury-service';

interface PermissoesViewProps {
  usuarios: PermissaoUsuario[];
  onRefresh: () => void;
  onShowToast: (msg: string) => void;
}

export const PermissoesView: React.FC<PermissoesViewProps> = ({
  usuarios,
  onRefresh,
  onShowToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPerfil, setSelectedPerfil] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativos' | 'inativos'>('todos');

  const [editingUser, setEditingUser] = useState<PermissaoUsuario | null>(null);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // New user form state
  const [newUserForm, setNewUserForm] = useState<{
    nome: string;
    email: string;
    cargo: string;
    congregacao_nome: string;
    perfil: PerfilAcesso;
    acesso_tesouraria_ativo: boolean;
  }>({
    nome: '',
    email: '',
    cargo: 'Tesoureiro Local',
    congregacao_nome: 'Safira',
    perfil: 'tesoureiro_congregacao',
    acesso_tesouraria_ativo: true,
  });

  // Filter users
  const filteredUsers = useMemo(() => {
    return usuarios.filter((u) => {
      const matchPerfil = selectedPerfil === 'todos' || u.perfil === selectedPerfil;
      const matchStatus =
        statusFilter === 'todos'
          ? true
          : statusFilter === 'ativos'
          ? u.acesso_tesouraria_ativo
          : !u.acesso_tesouraria_ativo;
      const matchSearch =
        !searchQuery ||
        u.nome.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.cargo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.congregacao_nome.toLowerCase().includes(searchQuery.toLowerCase());

      return matchPerfil && matchStatus && matchSearch;
    });
  }, [usuarios, selectedPerfil, statusFilter, searchQuery]);

  // Quick stats
  const stats = useMemo(() => {
    const total = usuarios.length;
    const ativos = usuarios.filter((u) => u.acesso_tesouraria_ativo).length;
    const inativos = total - ativos;
    const validadores = usuarios.filter(
      (u) => u.permissoes && u.permissoes.validar_relatorios && u.acesso_tesouraria_ativo
    ).length;

    return { total, ativos, inativos, validadores };
  }, [usuarios]);

  // Quick toggle access on/off
  const handleToggleAccess = async (user: PermissaoUsuario) => {
    const updated: PermissaoUsuario = {
      ...user,
      acesso_tesouraria_ativo: !user.acesso_tesouraria_ativo,
    };
    await TreasuryService.updatePermissaoUsuario(updated);
    onShowToast(
      updated.acesso_tesouraria_ativo
        ? `Acesso ao app liberado para ${user.nome}.`
        : `Acesso ao app revogado para ${user.nome}.`
    );
    onRefresh();
  };

  const getPresetPermissions = (perfil: PerfilAcesso) => {
    switch (perfil) {
      case 'admin':
      case 'tesoureiro_geral':
        return {
          validar_relatorios: true,
          rejeitar_relatorios: true,
          editar_envelopes: true,
          visualizar_dashboard: true,
          gerenciar_permissoes: perfil === 'admin',
          exportar_dados: true,
          excluir_relatorios: perfil === 'admin',
          auditar_conferencia: true,
        };
      case 'tesoureiro_congregacao':
        return {
          validar_relatorios: false,
          rejeitar_relatorios: false,
          editar_envelopes: true,
          visualizar_dashboard: true,
          gerenciar_permissoes: false,
          exportar_dados: true,
          excluir_relatorios: false,
          auditar_conferencia: false,
        };
      case 'auditor_fiscal':
        return {
          validar_relatorios: false,
          rejeitar_relatorios: false,
          editar_envelopes: false,
          visualizar_dashboard: true,
          gerenciar_permissoes: false,
          exportar_dados: true,
          excluir_relatorios: false,
          auditar_conferencia: true,
        };
      case 'visualizador':
      default:
        return {
          validar_relatorios: false,
          rejeitar_relatorios: false,
          editar_envelopes: false,
          visualizar_dashboard: true,
          gerenciar_permissoes: false,
          exportar_dados: false,
          excluir_relatorios: false,
          auditar_conferencia: false,
        };
    }
  };

  const handleSaveEditUser = async () => {
    if (!editingUser) return;
    setIsSaving(true);
    await TreasuryService.updatePermissaoUsuario(editingUser);
    setIsSaving(false);
    onShowToast(`Permissões de ${editingUser.nome} atualizadas.`);
    setEditingUser(null);
    onRefresh();
  };

  const handleCreateNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserForm.nome || !newUserForm.email) {
      alert('Preencha nome e e-mail do usuário.');
      return;
    }

    const novo: PermissaoUsuario = {
      id: `usr-${Date.now()}`,
      user_id: `auth-${Date.now()}`,
      nome: newUserForm.nome,
      email: newUserForm.email,
      cargo: newUserForm.cargo,
      congregacao_nome: newUserForm.congregacao_nome,
      setor: newUserForm.congregacao_nome,
      perfil: newUserForm.perfil,
      acesso_tesouraria_ativo: newUserForm.acesso_tesouraria_ativo,
      permissoes: getPresetPermissions(newUserForm.perfil),
      criado_em: new Date().toISOString().slice(0, 10),
      ultimo_acesso: 'Nunca acessou',
    };

    setIsSaving(true);
    await TreasuryService.createPermissaoUsuario(novo);
    setIsSaving(false);
    setIsAddUserModalOpen(false);
    onShowToast(`Usuário ${novo.nome} cadastrado com sucesso!`);
    setNewUserForm({
      nome: '',
      email: '',
      cargo: 'Tesoureiro Local',
      congregacao_nome: 'Safira',
      perfil: 'tesoureiro_congregacao',
      acesso_tesouraria_ativo: true,
    });
    onRefresh();
  };

  const getPerfilLabel = (perfil: PerfilAcesso) => {
    switch (perfil) {
      case 'admin':
        return 'Administrador Geral';
      case 'tesoureiro_geral':
        return 'Tesoureiro Geral';
      case 'tesoureiro_congregacao':
        return 'Tesoureiro de Setor/Célula';
      case 'auditor_fiscal':
        return 'Auditor Fiscal';
      case 'visualizador':
        return 'Visualizador';
    }
  };

  return (
    <div className="p-3.5 sm:p-6 space-y-6 max-w-[1600px] mx-auto text-slate-100">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#24293f] p-5 rounded-xl border border-[#323955] shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
            Permissões de Acesso ao App da Tesouraria
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Marque e gerencie quais usuários e tesoureiros terão autorização para operar o sistema financeiro
          </p>
        </div>

        <button
          onClick={() => setIsAddUserModalOpen(true)}
          className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-xs flex items-center gap-2 cursor-pointer self-start md:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          Conceder Permissão / Adicionar Usuário
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#24293f] p-4 rounded-xl border border-[#323955] shadow-xs">
          <div className="text-xs text-slate-400 mb-1">Total de Usuários Cadastrados</div>
          <div className="text-2xl font-bold text-white font-mono tabular-nums">{stats.total}</div>
          <div className="text-xs text-slate-400 mt-1">Liderança e equipe de tesouraria</div>
        </div>

        <div className="bg-[#24293f] p-4 rounded-xl border border-emerald-500/30 shadow-xs">
          <div className="text-xs text-slate-400 mb-1">Acesso Permitido ao App</div>
          <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">
            {stats.ativos}
          </div>
          <div className="text-xs text-emerald-300 font-medium mt-1">
            Autorizados a usar o app da tesouraria
          </div>
        </div>

        <div className="bg-[#24293f] p-4 rounded-xl border border-rose-500/30 shadow-xs">
          <div className="text-xs text-slate-400 mb-1">Acesso Bloqueado</div>
          <div className="text-2xl font-bold text-rose-400 font-mono tabular-nums">
            {stats.inativos}
          </div>
          <div className="text-xs text-rose-300 font-medium mt-1">Acesso revogado</div>
        </div>

        <div className="bg-[#24293f] p-4 rounded-xl border border-[#323955] shadow-xs">
          <div className="text-xs text-slate-400 mb-1">Homologadores Autorizados</div>
          <div className="text-2xl font-bold text-indigo-300 font-mono tabular-nums">
            {stats.validadores}
          </div>
          <div className="text-xs text-slate-400 mt-1">Permissão de validar relatórios</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#24293f] p-4 rounded-xl border border-[#323955] shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Tabs */}
            <div className="flex items-center p-1 bg-[#181c2b] rounded-lg text-xs border border-[#313956]">
              <button
                onClick={() => setStatusFilter('todos')}
                className={`px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer ${
                  statusFilter === 'todos'
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Todos ({stats.total})
              </button>
              <button
                onClick={() => setStatusFilter('ativos')}
                className={`px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer ${
                  statusFilter === 'ativos'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Ativos ({stats.ativos})
              </button>
              <button
                onClick={() => setStatusFilter('inativos')}
                className={`px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer ${
                  statusFilter === 'inativos'
                    ? 'bg-rose-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Bloqueados ({stats.inativos})
              </button>
            </div>

            {/* Perfil Dropdown */}
            <select
              value={selectedPerfil}
              onChange={(e) => setSelectedPerfil(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-[#313956] bg-[#181c2b] text-slate-200 focus:outline-none focus:border-indigo-400 cursor-pointer"
            >
              <option value="todos">Todos os Perfis</option>
              <option value="admin">Administrador Geral</option>
              <option value="tesoureiro_geral">Tesoureiro Geral</option>
              <option value="tesoureiro_congregacao">Tesoureiro de Setor/Célula</option>
              <option value="auditor_fiscal">Auditor Fiscal</option>
              <option value="visualizador">Visualizador</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="relative sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nome, email, cargo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#313956] bg-[#181c2b] text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400"
            />
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-[#181c2b] rounded-xl border border-[#323955] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#141724] border-b border-[#2a2f48] text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Usuário</th>
                <th className="py-3 px-4">Cargo / Função</th>
                <th className="py-3 px-4">Setor / Congregação</th>
                <th className="py-3 px-4">Perfil de Acesso</th>
                <th className="py-3 px-4 text-center">Acesso ao App Tesouraria</th>
                <th className="py-3 px-4">Permissões Específicas</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#23283c]">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Nenhum usuário com permissões cadastrado no banco de dados.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-[#1e2336] transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{user.nome}</div>
                      <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3 text-slate-400" />
                        {user.email}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-slate-300 font-medium">{user.cargo}</td>

                    <td className="py-3.5 px-4 text-slate-300">{user.congregacao_nome}</td>

                    <td className="py-3.5 px-4">
                      <span className="text-white font-medium block">
                        {getPerfilLabel(user.perfil)}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        Último acesso: {user.ultimo_acesso || 'Nunca'}
                      </span>
                    </td>

                    {/* DIRECT TOGGLE FOR APP ACCESS AS REQUESTED */}
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleToggleAccess(user)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                          user.acesso_tesouraria_ativo
                            ? 'bg-emerald-950 text-emerald-300 hover:bg-emerald-900 border border-emerald-500/40'
                            : 'bg-rose-950 text-rose-300 hover:bg-rose-900 border border-rose-500/40'
                        }`}
                        title="Clique para alternar permissão de acesso ao app"
                      >
                        {user.acesso_tesouraria_ativo ? (
                          <>
                            <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Permitido</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5 text-rose-400" />
                            <span>Bloqueado</span>
                          </>
                        )}
                      </button>
                    </td>

                    {/* Specific Permissions badges */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        {user.permissoes && user.permissoes.validar_relatorios && (
                          <span className="px-1.5 py-0.5 bg-[#252a40] text-emerald-300 border border-emerald-500/30 rounded text-[10px] font-medium">
                            Validar
                          </span>
                        )}
                        {user.permissoes && user.permissoes.editar_envelopes && (
                          <span className="px-1.5 py-0.5 bg-[#252a40] text-indigo-300 border border-indigo-500/30 rounded text-[10px] font-medium">
                            Envelopes
                          </span>
                        )}
                        {user.permissoes && user.permissoes.visualizar_dashboard && (
                          <span className="px-1.5 py-0.5 bg-[#252a40] text-cyan-300 border border-cyan-500/30 rounded text-[10px] font-medium">
                            Dashboard
                          </span>
                        )}
                        {user.permissoes && user.permissoes.gerenciar_permissoes && (
                          <span className="px-1.5 py-0.5 bg-purple-950 text-purple-300 border border-purple-500/30 rounded text-[10px] font-medium">
                            Admin
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => setEditingUser({ ...user })}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#252a40] hover:bg-[#323956] border border-[#394164] rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-indigo-400" />
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-[#181c2b] rounded-xl shadow-2xl border border-[#323955] max-w-xl w-full p-6 my-8 text-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-[#2d334d]">
              <div>
                <h2 className="text-base font-bold text-white">
                  Editar Permissões: {editingUser.nome}
                </h2>
                <p className="text-xs text-slate-400">{editingUser.email}</p>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-[#252a40] rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs text-slate-200">
              {/* Master Access Switch */}
              <div className="p-3.5 rounded-lg border border-[#323955] bg-[#141724] flex items-center justify-between">
                <div>
                  <span className="font-bold text-white block">
                    Permissão de Acesso ao App da Tesouraria
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    Habilita ou bloqueia o uso do aplicativo financeiro para este usuário
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={editingUser.acesso_tesouraria_ativo}
                  onChange={(e) =>
                    setEditingUser({
                      ...editingUser,
                      acesso_tesouraria_ativo: e.target.checked,
                    })
                  }
                  className="w-5 h-5 rounded border-slate-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </div>

              {/* Perfil & Setor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Perfil de Acesso
                  </label>
                  <select
                    value={editingUser.perfil}
                    onChange={(e) => {
                      const newPerfil = e.target.value as PerfilAcesso;
                      setEditingUser({
                        ...editingUser,
                        perfil: newPerfil,
                        permissoes: getPresetPermissions(newPerfil),
                      });
                    }}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-[#323955] bg-[#141724] text-white"
                  >
                    <option value="admin">Administrador Geral</option>
                    <option value="tesoureiro_geral">Tesoureiro Geral</option>
                    <option value="tesoureiro_congregacao">Tesoureiro de Setor/Célula</option>
                    <option value="auditor_fiscal">Auditor Fiscal</option>
                    <option value="visualizador">Visualizador</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Setor Vinculado
                  </label>
                  <input
                    type="text"
                    value={editingUser.congregacao_nome}
                    onChange={(e) =>
                      setEditingUser({
                        ...editingUser,
                        congregacao_nome: e.target.value,
                        setor: e.target.value,
                      })
                    }
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-[#323955] bg-[#141724] text-white"
                  />
                </div>
              </div>

              {/* Granular Permissions Checkboxes */}
              <div>
                <label className="block text-xs font-bold text-white mb-2">
                  Matriz de Permissões
                </label>
                <div className="space-y-2.5 border border-[#323955] p-3 rounded-lg bg-[#141724]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingUser.permissoes?.validar_relatorios || false}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          permissoes: {
                            ...editingUser.permissoes,
                            validar_relatorios: e.target.checked,
                          },
                        })
                      }
                      className="rounded border-slate-400 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Validar e homologar relatórios de envelopes</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingUser.permissoes?.editar_envelopes || false}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          permissoes: {
                            ...editingUser.permissoes,
                            editar_envelopes: e.target.checked,
                          },
                        })
                      }
                      className="rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Editar valores de envelopes e células</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingUser.permissoes?.visualizar_dashboard || false}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          permissoes: {
                            ...editingUser.permissoes,
                            visualizar_dashboard: e.target.checked,
                          },
                        })
                      }
                      className="rounded border-slate-400 text-cyan-600 focus:ring-cyan-500"
                    />
                    <span>Visualizar dashboard executivo e gráficos</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingUser.permissoes?.gerenciar_permissoes || false}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          permissoes: {
                            ...editingUser.permissoes,
                            gerenciar_permissoes: e.target.checked,
                          },
                        })
                      }
                      className="rounded border-slate-400 text-purple-600 focus:ring-purple-500"
                    />
                    <span>Gerenciar usuários e permissões do app</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingUser.permissoes?.exportar_dados || false}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          permissoes: {
                            ...editingUser.permissoes,
                            exportar_dados: e.target.checked,
                          },
                        })
                      }
                      className="rounded border-slate-400 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Exportar relatórios</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#2d334d]">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-[#252a40] rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveEditUser}
                className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-[#181c2b] rounded-xl shadow-2xl border border-[#323955] max-w-lg w-full p-6 my-8 text-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-[#2d334d]">
              <h2 className="text-base font-bold text-white">Conceder Permissão a Novo Usuário</h2>
              <button
                onClick={() => setIsAddUserModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-[#252a40] rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewUser} className="py-4 space-y-3.5 text-xs text-slate-200">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Junio Fonteles"
                  value={newUserForm.nome}
                  onChange={(e) => setNewUserForm({ ...newUserForm, nome: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#323955] bg-[#141724] text-white focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  placeholder="exemplo@pazchurch.com"
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#323955] bg-[#141724] text-white focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Cargo / Função</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Líder de Setor"
                    value={newUserForm.cargo}
                    onChange={(e) => setNewUserForm({ ...newUserForm, cargo: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#323955] bg-[#141724] text-white focus:outline-none focus:border-indigo-400"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Setor</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Safira"
                    value={newUserForm.congregacao_nome}
                    onChange={(e) =>
                      setNewUserForm({ ...newUserForm, congregacao_nome: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#323955] bg-[#141724] text-white focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Perfil de Acesso</label>
                <select
                  value={newUserForm.perfil}
                  onChange={(e) =>
                    setNewUserForm({ ...newUserForm, perfil: e.target.value as PerfilAcesso })
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#323955] bg-[#141724] text-white focus:outline-none focus:border-indigo-400 cursor-pointer"
                >
                  <option value="tesoureiro_congregacao">Tesoureiro de Setor/Célula</option>
                  <option value="tesoureiro_geral">Tesoureiro Geral</option>
                  <option value="admin">Administrador Geral</option>
                  <option value="auditor_fiscal">Auditor Fiscal</option>
                  <option value="visualizador">Visualizador</option>
                </select>
              </div>

              <div className="p-3 bg-[#141724] border border-emerald-500/30 rounded-lg flex items-center justify-between">
                <div>
                  <span className="font-bold text-white block">Ativar Acesso Imediatamente</span>
                  <span className="text-[11px] text-slate-400">
                    O usuário já terá permissão liberada
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={newUserForm.acesso_tesouraria_ativo}
                  onChange={(e) =>
                    setNewUserForm({ ...newUserForm, acesso_tesouraria_ativo: e.target.checked })
                  }
                  className="w-5 h-5 rounded border-slate-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#2d334d]">
                <button
                  type="button"
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-[#252a40] rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-xs cursor-pointer"
                >
                  Salvar e Conceder Acesso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
