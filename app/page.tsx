'use client';

import React, { useState, useEffect, useMemo, useCallback, useSyncExternalStore } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { LoginView } from '@/components/views/LoginView';
import { ValidarRelatoriosView } from '@/components/views/ValidarRelatoriosView';
import { RelacaoEnvelopesView } from '@/components/views/RelacaoEnvelopesView';
import { DashboardView } from '@/components/views/DashboardView';
import { PermissoesView } from '@/components/views/PermissoesView';
import { TreasuryService } from '@/lib/treasury-service';
import { ViewMode, LancamentoTesouraria, PermissaoUsuario, MembroItem, UnidadeCadastrada } from '@/lib/types';

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

  const [lancamentos, setLancamentos] = useState<LancamentoTesouraria[]>([]);
  const [unidadesCadastradas, setUnidadesCadastradas] = useState<UnidadeCadastrada[]>([]);
  const [usuarios, setUsuarios] = useState<PermissaoUsuario[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [notificacao, setNotificacao] = useState<string | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);

  // Filter states per view
  const [anoDashboard, setAnoDashboard] = useState<number | string>(2026);
  const [anoValidar, setAnoValidar] = useState<number | string>(2026);
  const [anoEnvelopes, setAnoEnvelopes] = useState<number | string>(2026);
  const [mesEnvelopes, setMesEnvelopes] = useState<string>(() => String(new Date().getMonth() + 1));
  const [setorEnvelopes, setSetorEnvelopes] = useState<string>('Safira');

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

  // Estável entre renderizações: as telas podem usá-la sem disparar recarregamentos
  const showToast = useCallback((msg: string) => {
    setNotificacao(msg);
    setTimeout(() => {
      setNotificacao(null);
    }, 3500);
  }, []);

  // Ano dos dados = ano escolhido na tela aberta (cada tela tem o seu seletor).
  // "Todos os anos" busca todos os anos; o serviço guarda cada período em cache separado.
  const anoDados =
    currentView === 'relacao-envelopes'
      ? anoEnvelopes
      : currentView === 'dashboard'
      ? anoDashboard
      : anoValidar;
  const periodoDados: number | string =
    String(anoDados).toLowerCase().startsWith('todos') ? 'todos' : Number(anoDados) || new Date().getFullYear();

  // Carrega só o período da tela ativa (sem varrer o banco todo)
  const carregarDados = useCallback(
    async (forcar: boolean) => {
      const relResult = await TreasuryService.fetchRelatorios(forcar, periodoDados);
      if (relResult.error) {
        showToast(
          relResult.isAuthError
            ? 'Sessão expirada ou sem permissão de tesouraria. Faça login novamente.'
            : relResult.error
        );
      } else {
        setLancamentos(relResult.data || []);
      }
      return !relResult.error;
    },
    [periodoDados, showToast]
  );

  // Carregamento inicial: só busca dados se já houver sessão salva
  useEffect(() => {
    let isSubscribed = true;

    const fetchInitial = async () => {
      try {
        const user = await TreasuryService.getSessionUser();
        if (!user || !isSubscribed) return;
        setSessaoManual(user);
        const [_, unids] = await Promise.all([
          carregarDados(false),
          TreasuryService.fetchUnidadesCadastradas(false),
        ]);
        if (unids && isSubscribed) {
          setUnidadesCadastradas(unids);
        }
      } catch (err) {
        console.warn('Erro ao carregar dados do Supabase:', err);
      }
    };

    fetchInitial();

    return () => {
      isSubscribed = false;
    };
  }, [carregarDados]);

  // Estável entre renderizações (useCallback): telas que recebem onRefresh não re-executam efeitos à toa
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [ok, unids] = await Promise.all([carregarDados(true), TreasuryService.fetchUnidadesCadastradas(true)]);
      if (unids) setUnidadesCadastradas(unids);
      if (ok) showToast('Dados sincronizados com o Supabase com sucesso!');
    } catch (err) {
      console.warn('Erro ao atualizar dados:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [carregarDados, showToast]);

  const handleLoginSuccess = (membro: MembroItem) => {
    try {
      localStorage.setItem('tesouraria_usuario_logado', JSON.stringify(membro));
    } catch {}
    setSessaoManual(membro);
    setIsLoggedOut(false);
    setCurrentView('validar-relatorios');
    showToast(`Bem-vindo, ${membro.nome}!`);
    // A sessão acabou de ser criada: agora sim busca os dados
    carregarDados(true);
    TreasuryService.fetchUnidadesCadastradas(true).then((u) => {
      if (u) setUnidadesCadastradas(u);
    });
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
          <div className={viewEfetiva === 'validar-relatorios' ? 'block min-h-full' : 'hidden'}>
            <ValidarRelatoriosView
              lancamentos={lancamentos}
              anoSelecionado={anoValidar}
              onSelectAno={setAnoValidar}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              onShowToast={showToast}
              usuarioLogado={usuarioLogado}
              usuarios={usuarios}
            />
          </div>

          <div className={viewEfetiva === 'relacao-envelopes' ? 'block min-h-full' : 'hidden'}>
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
          </div>

          <div className={viewEfetiva === 'dashboard' ? 'block min-h-full' : 'hidden'}>
            <DashboardView
              lancamentos={lancamentos}
              anoSelecionado={anoDashboard}
              onSelectAno={setAnoDashboard}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              onToggleMobileMenu={() => setIsMobileNavOpen((prev) => !prev)}
              onShowToast={showToast}
              unidades={unidadesCadastradas}
              usuarioLogado={usuarioLogado}
            />
          </div>

          <div className={viewEfetiva === 'permissoes' ? 'block min-h-full' : 'hidden'}>
            <PermissoesView
              usuarios={usuarios}
              onRefresh={handleRefresh}
              onShowToast={showToast}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
