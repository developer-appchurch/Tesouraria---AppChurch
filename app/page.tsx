'use client';

import React, { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { LoginView } from '@/components/views/LoginView';
import { ValidarRelatoriosView } from '@/components/views/ValidarRelatoriosView';
import { RelacaoEnvelopesView } from '@/components/views/RelacaoEnvelopesView';
import { DashboardView } from '@/components/views/DashboardView';
import { PermissoesView } from '@/components/views/PermissoesView';
import { LoadingScreen } from '@/components/LoadingScreen';
import { TreasuryService } from '@/lib/treasury-service';
import { ViewMode, LancamentoTesouraria, PermissaoUsuario, MembroItem } from '@/lib/types';

const emptySubscribe = (callback: () => void) => {
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', callback);
    return () => window.removeEventListener('storage', callback);
  }
  return () => {};
};

function getStoredUserSnapshot(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('tesouraria_usuario_logado');
  } catch {
    return null;
  }
}

function getServerSnapshot(): string | null {
  return null;
}

export default function TreasuryApp() {
  const storedUserJson = useSyncExternalStore(emptySubscribe, getStoredUserSnapshot, getServerSnapshot);
  const [sessaoManual, setSessaoManual] = useState<MembroItem | null>(null);
  const [isLoggedOut, setIsLoggedOut] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<ViewMode>('validar-relatorios');

  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [lancamentos, setLancamentos] = useState<LancamentoTesouraria[]>([]);
  const [usuarios, setUsuarios] = useState<PermissaoUsuario[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [notificacao, setNotificacao] = useState<string | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);

  // Filter states per view
  const [anoDashboard, setAnoDashboard] = useState<number | string>(2026);
  const [anoValidar, setAnoValidar] = useState<number | string>(2026);
  const [anoEnvelopes, setAnoEnvelopes] = useState<number | string>(2026);
  const [mesEnvelopes, setMesEnvelopes] = useState<string>('todos');
  const [setorEnvelopes, setSetorEnvelopes] = useState<string>('todos');

  // Compute active user safely across SSR and Client
  const usuarioLogado = useMemo(() => {
    if (isLoggedOut) return null;
    if (sessaoManual) return sessaoManual;
    if (storedUserJson) {
      try {
        const parsed = JSON.parse(storedUserJson);
        if (parsed && parsed.nome) return parsed as MembroItem;
      } catch {}
    }
    return null;
  }, [isLoggedOut, sessaoManual, storedUserJson]);

  const showToast = (msg: string) => {
    setNotificacao(msg);
    setTimeout(() => {
      setNotificacao(null);
    }, 3500);
  };

  // Initial fetch from Supabase
  useEffect(() => {
    let isSubscribed = true;

    const fetchInitial = async () => {
      try {
        const user = await TreasuryService.getSessionUser();
        if (user && isSubscribed) {
          setSessaoManual(user);
        }

        const [relResult, permResult] = await Promise.all([
          TreasuryService.fetchRelatorios(false),
          TreasuryService.fetchPermissoes(false),
        ]);
        if (isSubscribed) {
          if (relResult.data) {
            setLancamentos(relResult.data);
          }
          if (permResult.data) {
            setUsuarios(permResult.data);
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar dados do Supabase:', err);
      } finally {
        if (isSubscribed) {
          setIsInitialLoading(false);
        }
      }
    };

    fetchInitial();

    return () => {
      isSubscribed = false;
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const [relResult, permResult] = await Promise.all([
        TreasuryService.fetchRelatorios(true),
        TreasuryService.fetchPermissoes(true),
      ]);
      setLancamentos(relResult.data || []);
      setUsuarios(permResult.data || []);
      showToast('Dados sincronizados com o Supabase com sucesso!');
    } catch (err) {
      console.warn('Erro ao atualizar dados:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLoginSuccess = (membro: MembroItem) => {
    try {
      localStorage.setItem('tesouraria_usuario_logado', JSON.stringify(membro));
    } catch {}
    setSessaoManual(membro);
    setIsLoggedOut(false);
    setCurrentView('validar-relatorios');
    showToast(`Bem-vindo, ${membro.nome}!`);
  };

  const handleLogout = async () => {
    await TreasuryService.logout();
    setSessaoManual(null);
    setIsLoggedOut(true);
    setCurrentView('login');
    showToast('Sessão encerrada com sucesso.');
  };

  // Setores únicos
  const setoresDisponiveis = useMemo(() => {
    const sSet = new Set<string>();
    sSet.add('Safira');
    sSet.add('Fire');
    sSet.add('White');
    sSet.add('Black');
    sSet.add('Azul');
    sSet.add('Amarelo');
    sSet.add('Legacy');
    sSet.add('Onix');
    sSet.add('Diamante');
    sSet.add('Titanium');
    lancamentos.forEach((l) => {
      const s = (l.Setor || l.setor || '').trim();
      if (s) sSet.add(s);
    });
    return Array.from(sSet);
  }, [lancamentos]);

  // Contagem de pendentes
  const pendingCount = useMemo(() => {
    return lancamentos.filter((l) => l.TESOURARIA_RECEB !== true).length;
  }, [lancamentos]);

  // Active header year
  const anoAtivoHeader =
    currentView === 'relacao-envelopes'
      ? anoEnvelopes
      : currentView === 'validar-relatorios'
      ? anoValidar
      : anoDashboard;

  const setAnoAtivoHeader =
    currentView === 'relacao-envelopes'
      ? setAnoEnvelopes
      : currentView === 'validar-relatorios'
      ? setAnoValidar
      : setAnoDashboard;

  // View efetiva
  const viewEfetiva: ViewMode = !usuarioLogado
    ? 'login'
    : currentView === 'login'
    ? 'validar-relatorios'
    : currentView;

  // Render Loading Screen enquanto carrega dados do Supabase
  if (isInitialLoading) {
    return <LoadingScreen mensagem="Carregando dados do Supabase..." subtexto="Sincronizando relatórios e permissões da igreja..." />;
  }

  // Render Login View if not logged in
  if (viewEfetiva === 'login') {
    return <LoginView onLoginSuccess={handleLoginSuccess} usuarios={usuarios} />;
  }

  return (
    <div id="app-root-container" className="flex h-screen bg-[#1c2030] text-slate-100 overflow-hidden font-sans">
      {/* Persistent Sidebar */}
      <Sidebar
        currentView={viewEfetiva}
        onSelectView={(v) => {
          setCurrentView(v);
          setIsMobileNavOpen(false);
        }}
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
        pendingCount={pendingCount}
        onLogout={handleLogout}
        usuarioLogado={usuarioLogado}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        {viewEfetiva !== 'dashboard' && (
          <Header
            currentView={viewEfetiva}
            anoSelecionado={anoAtivoHeader}
            onSelectAno={setAnoAtivoHeader}
            lancamentos={lancamentos}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            onToggleMobileMenu={() => setIsMobileNavOpen((prev) => !prev)}
            mesSelecionado={mesEnvelopes}
            onSelectMes={setMesEnvelopes}
            setorSelecionado={setorEnvelopes}
            onSelectSetor={setSetorEnvelopes}
            onShowToast={showToast}
          />
        )}

        {/* Toast Notification */}
        {notificacao && (
          <div className="fixed bottom-5 right-5 z-50 bg-[#161a29] border border-emerald-500/40 text-white px-4 py-3 rounded-lg shadow-xl flex items-center gap-2.5 text-xs animate-in slide-in-from-bottom-2 duration-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>{notificacao}</span>
          </div>
        )}

        {/* Dynamic Views */}
        <main className="flex-1 overflow-y-auto bg-[#1a1d2e] relative">
          {viewEfetiva === 'validar-relatorios' && (
            <ValidarRelatoriosView
              lancamentos={lancamentos}
              anoSelecionado={anoValidar}
              onSelectAno={setAnoValidar}
              onRefresh={handleRefresh}
              onShowToast={showToast}
              usuarioLogado={usuarioLogado}
              usuarios={usuarios}
            />
          )}

          {viewEfetiva === 'relacao-envelopes' && (
            <RelacaoEnvelopesView
              lancamentos={lancamentos}
              anoSelecionado={anoEnvelopes}
              onSelectAno={setAnoEnvelopes}
              mesSelecionado={mesEnvelopes}
              onSelectMes={setMesEnvelopes}
              setorSelecionado={setorEnvelopes}
              onSelectSetor={setSetorEnvelopes}
              onRefresh={handleRefresh}
              onShowToast={showToast}
            />
          )}

          {viewEfetiva === 'dashboard' && (
            <DashboardView
              lancamentos={lancamentos}
              anoSelecionado={anoDashboard}
              onSelectAno={setAnoDashboard}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              onToggleMobileMenu={() => setIsMobileNavOpen((prev) => !prev)}
              onShowToast={showToast}
            />
          )}

          {viewEfetiva === 'permissoes' && (
            <PermissoesView
              usuarios={usuarios}
              onRefresh={handleRefresh}
              onShowToast={showToast}
            />
          )}
        </main>
      </div>
    </div>
  );
}
