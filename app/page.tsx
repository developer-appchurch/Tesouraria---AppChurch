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
  // Decidido pelo servidor (papel church:admin / permissions:manage do AppChurch)
  const [podeGerenciarPermissoes, setPodeGerenciarPermissoes] = useState<boolean>(false);

  // Anos com relatórios (do primeiro até o atual), para os seletores de ano de todas as telas
  const [primeiroAno, setPrimeiroAno] = useState<number | null>(null);
  const anosComRelatorios = useMemo(() => {
    const atual = new Date().getFullYear();
    const inicio = Math.min(primeiroAno ?? atual, atual);
    return Array.from({ length: atual - inicio + 1 }, (_, i) => atual - i);
  }, [primeiroAno]);

  const carregarSessao = useCallback(async () => {
    const sessao = await TreasuryService.fetchMinhaSessao();
    setPodeGerenciarPermissoes(sessao?.podeGerenciarPermissoes === true);
    setPrimeiroAno(sessao?.primeiroAno ?? null);
  }, []);

  // Filter states per view
  // Padrão: ano corrente (não fixo no código)
  const [anoDashboard, setAnoDashboard] = useState<number | string>(() => new Date().getFullYear());
  const [anoValidar, setAnoValidar] = useState<number | string>(() => new Date().getFullYear());
  const [anoEnvelopes, setAnoEnvelopes] = useState<number | string>(() => new Date().getFullYear());
  const [mesEnvelopes, setMesEnvelopes] = useState<string>(() => String(new Date().getMonth() + 1));
  const [setorEnvelopes, setSetorEnvelopes] = useState<string>('');

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

  // Validar Relatórios busca seus próprios dados (painel_validacao): a lista
  // completa de lançamentos só é necessária no Dashboard e na Relação de Envelopes.
  const precisaLancamentos = currentView === 'dashboard' || currentView === 'relacao-envelopes';
  const estaLogado = Boolean(usuarioLogado);

  // Sessão salva: restaura o usuário, permissões e unidades UMA vez ao abrir o app
  useEffect(() => {
    let isSubscribed = true;
    (async () => {
      try {
        const user = await TreasuryService.getSessionUser();
        if (!user || !isSubscribed) return;
        setSessaoManual(user);
        const [unids] = await Promise.all([TreasuryService.fetchUnidadesCadastradas(false), carregarSessao()]);
        if (unids && isSubscribed) setUnidadesCadastradas(unids);
      } catch (err) {
        console.warn('Erro ao carregar dados do Supabase:', err);
      }
    })();
    return () => {
      isSubscribed = false;
    };
  }, [carregarSessao]);

  // Lançamentos do período, só nas telas que usam (o serviço guarda cada período em cache)
  useEffect(() => {
    if (!estaLogado || !precisaLancamentos) return;
    let cancelado = false;
    (async () => {
      const res = await TreasuryService.fetchRelatorios(false, periodoDados);
      if (cancelado) return; // usuário já trocou de período/tela: ignora resposta antiga
      if (res.error) {
        showToast(res.isAuthError ? 'Sessão expirada ou sem permissão de tesouraria. Faça login novamente.' : res.error);
      } else {
        setLancamentos(res.data || []);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [estaLogado, precisaLancamentos, periodoDados, showToast]);

  // Estável entre renderizações (useCallback): telas que recebem onRefresh não re-executam efeitos à toa
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [ok, unids] = await Promise.all([
        precisaLancamentos ? carregarDados(true) : Promise.resolve(true),
        TreasuryService.fetchUnidadesCadastradas(true),
      ]);
      if (unids) setUnidadesCadastradas(unids);
      if (ok) showToast('Dados sincronizados com o Supabase com sucesso!');
    } catch (err) {
      console.warn('Erro ao atualizar dados:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [precisaLancamentos, carregarDados, showToast]);

  const handleLoginSuccess = (membro: MembroItem) => {
    try {
      localStorage.setItem('tesouraria_usuario_logado', JSON.stringify(membro));
    } catch {}
    setLancamentos([]);
    setUnidadesCadastradas([]);
    setSessaoManual(membro);
    setIsLoggedOut(false);
    setCurrentView('validar-relatorios');
    showToast(`Bem-vindo, ${membro.nome}!`);
    // A sessão acabou de ser criada: os lançamentos são buscados pelo efeito acima
    carregarSessao();
    TreasuryService.fetchUnidadesCadastradas(true).then((u) => {
      if (u) setUnidadesCadastradas(u);
    });
  };

  const handleLogout = async () => {
    await TreasuryService.logout();
    // Zera os dados em tela: o próximo login (talvez de outra igreja) começa limpo
    setLancamentos([]);
    setUnidadesCadastradas([]);
    setPodeGerenciarPermissoes(false);
    setPrimeiroAno(null);
    setPendingCount(0);
    setSessaoManual(null);
    setIsLoggedOut(true);
    setCurrentView('login');
    showToast('Sessão encerrada com sucesso.');
  };

  // Setores da igreja: pais das unidades da ponta (células) no cadastro,
  // mais qualquer setor que apareça nos relatórios carregados
  const setoresDisponiveis = useMemo(() => {
    const porId = new Map(unidadesCadastradas.map((u) => [u.id, u.nome]));
    const pais = new Set(unidadesCadastradas.map((u) => u.pai_id).filter(Boolean));
    const sSet = new Set<string>();
    unidadesCadastradas.forEach((u) => {
      if (!pais.has(u.id) && u.pai_id && porId.get(u.pai_id)) sSet.add(porId.get(u.pai_id)!.trim());
    });
    lancamentos.forEach((l) => {
      const s = (l.Setor || l.setor || '').trim();
      if (s) sSet.add(s);
    });
    return Array.from(sSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [unidadesCadastradas, lancamentos]);

  // Contagem de pendentes: informada pela tela Validar Relatórios (resumo do servidor)
  const [pendingCount, setPendingCount] = useState<number>(0);

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
    : currentView === 'login' || (currentView === 'permissoes' && !podeGerenciarPermissoes)
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
        mostrarPermissoes={podeGerenciarPermissoes}
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
            setoresDisponiveis={setoresDisponiveis}
            anosBase={anosComRelatorios}
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
              ativa={viewEfetiva === 'validar-relatorios'}
              anosBase={anosComRelatorios}
              onPendentesChange={setPendingCount}
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
              anosBase={anosComRelatorios}
              usuarioLogado={usuarioLogado}
            />
          </div>

          {podeGerenciarPermissoes && (
            <div className={viewEfetiva === 'permissoes' ? 'block min-h-full' : 'hidden'}>
              <PermissoesView usuarios={usuarios} onRefresh={handleRefresh} onShowToast={showToast} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
