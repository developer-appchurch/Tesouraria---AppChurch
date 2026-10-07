import { getSupabaseClient } from './supabase';
import { LancamentoTesouraria, AgregadoDashboard, AppChurchUser, MembroItem, UnidadeCadastrada, TesourariaPermissaoItem, MembroBuscaItem } from './types';

// In-memory cache for high performance and reduced query consumption
let memoryLancamentos: LancamentoTesouraria[] | null = null;
let lastLancamentosFetch = 0;
// Cache de relatórios por período ("ano|mes"): trocar de ano não devolve dados de outro ano
const relatoriosCache = new Map<string, { data: LancamentoTesouraria[]; at: number }>();
let chaveLancamentosAtual: string | null = null;

function chavePeriodo(ano: number | string, mes?: number | string | null): string {
  const a = String(ano ?? '').toLowerCase();
  const anoNorm = !a || a === 'todos' || a === 'todos os anos' ? 'todos' : String(Number(ano) || ano);
  const mesNorm = mes === null || mes === undefined || mes === '' || mes === 'todos' ? 'todos' : String(Number(mes));
  return `${anoNorm}|${mesNorm}`;
}

/** Depois de validar/editar/excluir: mantém só o período atual (já atualizado) e descarta os demais. */
function sincronizarCacheRelatorios() {
  dashboardCache.clear();
  relatoriosCache.clear();
  if (memoryLancamentos && chaveLancamentosAtual) {
    relatoriosCache.set(chaveLancamentosAtual, { data: memoryLancamentos, at: lastLancamentosFetch });
  }
}
let memoryUnidades: UnidadeCadastrada[] | null = null;
// Totais do Dashboard por ano ("todos" = todos os anos)
const dashboardCache = new Map<string, { data: AgregadoDashboard[]; at: number }>();
let lastUnidadesFetch = 0;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache (no polling)

// Caches mantidos fora do serviço (ex.: telas) se registram aqui para serem
// limpos junto com os do serviço no login/logout: dados de uma igreja nunca
// podem aparecer para o próximo usuário do mesmo navegador.
const limpadoresDeCache = new Set<() => void>();
export function registrarLimpezaDeCache(limpar: () => void): void {
  limpadoresDeCache.add(limpar);
}

export function formatarDataBR(val: any): string {
  if (!val) return '-';
  const str = String(val).trim();
  if (str.includes('/')) return str;
  const clean = str.includes('T') ? str.split('T')[0] : str;
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
  }
  return str;
}

/** Rótulo para relatório cuja célula não está ligada a um setor no cadastro. */
export const SEM_SETOR = 'Sem setor';

export function converterItemParaLancamento(item: any, idx = 0): LancamentoTesouraria {
  const id = String(item.id || item.ID || item.Id || `rel-${Date.now()}-${idx}`);
  
  // Data formatting
  let dataBR = '';
  let dataIso = '';
  let ano = new Date().getFullYear();
  let mes = new Date().getMonth() + 1;
  
  const rawData = item.data_relatorio || item.DataCelula || item.data || item.created_at || item.criado_em || '';
  if (rawData) {
    const clean = String(rawData).split('T')[0].split(' ')[0];
    if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts.length === 3) {
        ano = parseInt(parts[0], 10) || ano;
        mes = parseInt(parts[1], 10) || mes;
        dataBR = `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
        dataIso = clean;
      }
    } else if (clean.includes('/')) {
      dataBR = clean;
      const parts = clean.split('/');
      if (parts.length === 3) {
        ano = parseInt(parts[2], 10) || ano;
        mes = parseInt(parts[1], 10) || mes;
        dataIso = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }

  if (!dataBR) {
    const today = new Date();
    dataIso = today.toISOString().split('T')[0];
    dataBR = formatarDataBR(dataIso);
    ano = today.getFullYear();
    mes = today.getMonth() + 1;
  }

  // Week number (automatically calculated or fallback)
  let semanaNumero = Number(item.numero_semana || item.semanaNumero || 0);
  if (!semanaNumero) {
    if (typeof item.NumSemana === 'number') semanaNumero = item.NumSemana;
    else if (typeof item.NumSemana === 'string') {
      const m = item.NumSemana.match(/\d+/);
      semanaNumero = m ? parseInt(m[0], 10) : 38;
    } else {
      try {
        const d = new Date(dataIso);
        const start = new Date(d.getFullYear(), 0, 1);
        const days = Math.floor((d.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
        semanaNumero = Math.ceil((days + start.getDay() + 1) / 7);
      } catch {
        semanaNumero = 38;
      }
    }
  }

  // Values: PIX vs Espécie vs Total
  const valorPix = Number(
    item.valor_pix ??
    item.ValorOferta ??
    item.total_pix ??
    item.total_dizimos ??
    item.Bairro ??
    0
  );

  const valorEspecie = Number(
    item.valor_especie ??
    item.OfertaEspecie ??
    item.total_dinheiro ??
    item.total_ofertas ??
    0
  );

  const valorTotal = Number(
    item.valor_total ??
    item.total_geral ??
    item.Total ??
    (valorPix + valorEspecie)
  );

  // Status & Validation directly based on column tesouraria_recebido:
  // TRUE = VALIDADO / CONFIRMADO
  // FALSE / NULL = PENDENTE
  const isConfirmado = item.tesouraria_recebido === true;

  const dataTesouraria = item.data_recebimento 
    ? formatarDataBR(item.data_recebimento) 
    : (item.DATA_TESOURARIA || (isConfirmado ? dataBR : undefined));

  const idTesoureiro = item.tesoureiro_id || item.ID_TESOUREIRO || undefined;

  // Parse celula, setor, and lider from item or observacao
  let celulaNome = '';
  let setor = '';
  let liderCelula = '';
  let area = '';

  const rawObs = String(item.observacao || item.observacoes || '').trim();

  if (rawObs.includes('|')) {
    const parts = rawObs.split('|').map((s) => s.trim());
    celulaNome = parts[0] || '';
    for (const p of parts) {
      if (p.toLowerCase().startsWith('setor:')) {
        setor = p.replace(/^setor:\s*/i, '').trim();
      } else if (p.toLowerCase().startsWith('líder:') || p.toLowerCase().startsWith('lider:')) {
        liderCelula = p.replace(/^l[íi]der:\s*/i, '').trim();
      }
    }
  }

  // 1. Prioriza o nome real da unidade / célula vinculada
  if (item.unidades && typeof item.unidades === 'object' && !Array.isArray(item.unidades) && item.unidades.nome) {
    celulaNome = String(item.unidades.nome).trim();
  } else if (item.unidade_nome) {
    celulaNome = String(item.unidade_nome).trim();
  }

  if (!celulaNome) {
    celulaNome = String(
      item.celula_nome ||
      item.Célula ||
      item.C_x00e9_lula ||
      item.congregacao_nome ||
      rawObs ||
      ''
    ).trim();
  }

  // Fallback if empty in database
  if (!celulaNome) {
    celulaNome = `Célula #${idx + 1}`;
  }

  if (item.setor || item.setor_nome || item.Setor) {
    setor = String(item.setor || item.setor_nome || item.Setor).trim();
  }

  if (!setor || setor === '-' || setor === 'undefined') {
    setor = SEM_SETOR;
  }

  if (!liderCelula) liderCelula = String(item.lider || item.LiderCelula || item.responsavel_envio || '-').trim();

  // Nome de quem validou: vem do servidor (membros.nome do tesoureiro_id)
  let nomeTesoureiro: string | undefined = undefined;
  if (isConfirmado) {
    const rawNome = item.NomeTesoureiro || item.nome_tesoureiro;
    nomeTesoureiro = rawNome ? String(rawNome).trim() : 'Tesoureiro';
  }

  const numSemanaFinal = item.numero_semana !== undefined && item.numero_semana !== null
    ? Number(item.numero_semana)
    : semanaNumero;

  let ativo = true;
  if (item.unidades && typeof item.unidades === 'object' && !Array.isArray(item.unidades)) {
    if (item.unidades.ativo !== undefined) {
      ativo = item.unidades.ativo === true;
    }
  }
  if (item.ativo !== undefined) {
    ativo = item.ativo === true;
  }

  return {
    id,
    ID: item.ID || id,
    igreja_id: item.igreja_id,
    unidade_id: item.unidade_id ? String(item.unidade_id) : undefined,
    data: dataIso,
    dataBR,
    semanaNumero: numSemanaFinal,
    NumSemana: numSemanaFinal,
    ano: Number(item.ano || ano),
    mes: Number(item.mes || mes),
    celulaNome,
    Célula: celulaNome,
    C_x00e9_lula: celulaNome,
    liderCelula,
    LiderCelula: liderCelula,
    Setor: setor,
    setor,
    area,
    Area: area,
    valorPix,
    ValorOferta: valorPix,
    valorEspecie,
    OfertaEspecie: valorEspecie,
    valorTotal,
    Total: valorTotal,
    TESOURARIA_RECEB: isConfirmado,
    tesouraria_recebido: isConfirmado,
    status: isConfirmado ? 'CONFIRMADO' : 'PENDENTE',
    DATA_TESOURARIA: dataTesouraria,
    data_recebimento: item.data_recebimento,
    ID_TESOUREIRO: idTesoureiro,
    tesoureiro_id: idTesoureiro,
    NomeTesoureiro: nomeTesoureiro,
    Membros: Number(item.qtd_membros || item.Membros || 0),
    Criancas: Number(item.qtd_criancas || item.Criancas || 0),
    observacoes: rawObs,
    ativo,
  };
}

interface TreasuryApiResult<T = any> {
  success: boolean;
  data?: T;
  count?: number;
  error?: string;
  message?: string;
  /** true quando a sessão expirou ou o usuário não tem permissão de tesouraria (401/403) */
  authError?: boolean;
}

/**
 * Único caminho de dados da Tesouraria: a rota /api/treasury, autenticada com o
 * token da sessão Supabase do usuário. Não há "plano B" consultando o banco
 * direto do navegador — se a API falhar, o erro volta para a tela, sem novas tentativas.
 */
async function callTreasuryApi<T = any>(action: string, params: any = {}): Promise<TreasuryApiResult<T>> {
  if (typeof window === 'undefined') return { success: false, error: 'Indisponível no servidor.' };
  try {
    const supabase = getSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      return { success: false, authError: true, error: 'Sessão expirada. Faça login novamente.' };
    }

    const res = await fetch('/api/treasury', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, params }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.success) return body;
    return {
      success: false,
      authError: res.status === 401 || res.status === 403 || body?.authError === true,
      error: body?.error || `Falha na API da tesouraria (código ${res.status}).`,
    };
  } catch (e: any) {
    console.warn('[callTreasuryApi] Falha na chamada da API:', e);
    return { success: false, error: 'Falha de conexão com o servidor. Verifique sua internet e tente novamente.' };
  }
}

export interface PainelValidacao {
  resumo: { pendentes: number; confirmados: number };
  setores: { setor_id: string; setor_nome: string; qtd_pendentes: number }[];
  relatorios: any[];
}

export const TreasuryService = {
  /**
   * Limpa cache em memória
   */
  clearCache() {
    memoryLancamentos = null;
    relatoriosCache.clear();
    chaveLancamentosAtual = null;
    memoryUnidades = null;
    dashboardCache.clear();
    lastLancamentosFetch = 0;
    lastUnidadesFetch = 0;
    limpadoresDeCache.forEach((limpar) => limpar());
  },

  /**
   * Autenticação via rota oficial do AppChurch:
   * POST https://app.appchurch.com.br/api/tesouraria/login
   */
  async loginAppChurch(
    login: string,
    password: string
  ): Promise<{
    success: boolean;
    user?: AppChurchUser;
    error?: string;
  }> {
    try {
      const response = await fetch('https://app.appchurch.com.br/api/tesouraria/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          login: login.trim(),
          password: password.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 200 && (data.success || data.access_token)) {
        const accessToken = data.access_token;
        const refreshToken = data.refresh_token;

        if (accessToken && refreshToken) {
          const supabase = getSupabaseClient();
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            console.warn('Aviso ao sincronizar sessão com Supabase:', sessionError.message);
          }
        }

        const userObj: AppChurchUser = data.user || {
          id: data.userId || '1',
          churchId: data.churchId || data.igreja_id,
          igreja_id: data.igreja_id || data.churchId,
          name: data.name || login,
          login: login,
          role: data.role || 'tesoureiro',
        };

        if (typeof window !== 'undefined') {
          localStorage.setItem('tesouraria_usuario_logado', JSON.stringify(userObj));
        }

        this.clearCache();

        return {
          success: true,
          user: userObj,
        };
      }

      if (response.status === 401) {
        return {
          success: false,
          error: data.message || 'Senha incorreta. Verifique suas credenciais.',
        };
      }

      if (response.status === 403) {
        return {
          success: false,
          error:
            data.message ||
            'Usuário sem permissão de acesso ao módulo de Tesouraria. Solicite a liberação à liderança da sua igreja.',
        };
      }

      if (response.status === 404) {
        return {
          success: false,
          error: data.message || 'Usuário não encontrado. Verifique seu login ou e-mail.',
        };
      }

      if (response.status === 429) {
        return {
          success: false,
          error:
            data.message ||
            'Muitas tentativas de login em curto período. Por favor, aguarde alguns minutos e tente novamente.',
        };
      }

      return {
        success: false,
        error: data.message || `Erro no login (Código ${response.status}). Tente novamente.`,
      };
    } catch (err: any) {
      return {
        success: false,
        error:
          err?.message ||
          'Falha na conexão com o servidor de autenticação do AppChurch. Verifique sua conexão com a internet.',
      };
    }
  },

  /**
   * Encerra a sessão do usuário no Supabase e limpa o armazenamento local
   */
  async logout(): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Erro ao encerrar sessão Supabase:', e);
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('tesouraria_usuario_logado');
    }
    this.clearCache();
  },

  /**
   * Recupera a sessão ativa do usuário
   */
  async getSessionUser(): Promise<MembroItem | null> {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem('tesouraria_usuario_logado');
      if (!stored) return null;
      const user = JSON.parse(stored);
      
      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getSession();
      
      // Return user with mapped MembroItem fields
      return {
        id: user.id,
        ID: user.id,
        churchId: user.churchId || user.igreja_id,
        igreja_id: user.igreja_id || user.churchId,
        nome: user.name || user.nome || user.login || 'Usuário',
        login: user.login || '',
        role: user.role || 'tesoureiro',
        cargo: user.role || 'Tesoureiro',
        email: user.email,
        status: 'Ativo',
      };
    } catch {
      return null;
    }
  },

  /**
   * Permissões da sessão atual, decididas pelo servidor (ex.: se pode gerenciar acessos).
   */
  async fetchMinhaSessao(): Promise<{ podeGerenciarPermissoes: boolean; primeiroAno: number | null } | null> {
    const res = await callTreasuryApi<{ podeGerenciarPermissoes: boolean; primeiroAno: number | null }>('minha_sessao');
    if (!res.success || !res.data) return null;
    const primeiroAno = Number(res.data.primeiroAno);
    return {
      podeGerenciarPermissoes: res.data.podeGerenciarPermissoes === true,
      primeiroAno: Number.isFinite(primeiroAno) && primeiroAno > 2000 ? primeiroAno : null,
    };
  },

  /**
   * Obtém relatórios semanais da própria igreja via API
   * Utiliza cache em memória por período para evitar requisições frequentes ao Supabase
   */
  async fetchRelatorios(
    forceRefresh = false,
    ano: number | string = new Date().getFullYear(),
    mes?: number | string | null
  ): Promise<{ data: LancamentoTesouraria[]; error?: string; isAuthError?: boolean }> {
    const now = Date.now();
    const chave = chavePeriodo(ano, mes);
    const emCache = relatoriosCache.get(chave);
    if (!forceRefresh && emCache && now - emCache.at < CACHE_TTL_MS) {
      memoryLancamentos = emCache.data;
      lastLancamentosFetch = emCache.at;
      chaveLancamentosAtual = chave;
      return { data: emCache.data };
    }

    const apiRes = await callTreasuryApi<any[]>('relatorios_detalhados', { ano, mes });
    if (apiRes.success && Array.isArray(apiRes.data)) {
      const formatted = apiRes.data.map((item: any, idx: number) => converterItemParaLancamento(item, idx));
      memoryLancamentos = formatted;
      lastLancamentosFetch = now;
      chaveLancamentosAtual = chave;
      relatoriosCache.set(chave, { data: formatted, at: now });
      return { data: formatted };
    }
    // Em erro, nunca devolve dados de outro período como se fossem deste
    return { data: emCache?.data || [], error: apiRes.error, isAuthError: apiRes.authError };
  },

  /**
   * Totais do Dashboard já somados no servidor: uma linha por (ano, mês, setor).
   */
  async fetchDashboardResumo(
    ano: number | string,
    forceRefresh = false
  ): Promise<{ data: AgregadoDashboard[]; error?: string; isAuthError?: boolean }> {
    const chave = chavePeriodo(ano);
    const emCache = dashboardCache.get(chave);
    if (!forceRefresh && emCache && Date.now() - emCache.at < CACHE_TTL_MS) return { data: emCache.data };

    const res = await callTreasuryApi<AgregadoDashboard[]>('dashboard_resumo', { ano });
    if (res.success && Array.isArray(res.data)) {
      dashboardCache.set(chave, { data: res.data, at: Date.now() });
      return { data: res.data };
    }
    return { data: emCache?.data || [], error: res.error, isAuthError: res.authError };
  },

  /**
   * Tudo que a tela "Validar Relatórios" precisa (resumo, pendências por setor e
   * relatórios) em UMA chamada por período.
   */
  async fetchPainelValidacao(
    ano: number | string,
    mes?: number | string | null
  ): Promise<{ success: boolean; data?: PainelValidacao; error?: string; isAuthError?: boolean }> {
    const apiRes = await callTreasuryApi<PainelValidacao>('painel_validacao', { ano, mes });
    if (apiRes.success && apiRes.data) {
      return { success: true, data: apiRes.data };
    }
    return { success: false, error: apiRes.error, isAuthError: apiRes.authError };
  },

  /**
   * Obtém todas as unidades cadastradas (id, nome, pai_id, ativo) da igreja
   */
  async fetchUnidadesCadastradas(forceRefresh = false): Promise<UnidadeCadastrada[]> {
    // Cache em memória: unidades mudam raramente, não precisam ser buscadas a cada renderização
    const now = Date.now();
    if (!forceRefresh && memoryUnidades && now - lastUnidadesFetch < CACHE_TTL_MS) {
      return memoryUnidades;
    }

    // Só via /api/treasury (autenticada e filtrada pela igreja do usuário).
    // Sem consulta direta do navegador: a tabela unidades não filtra por igreja sozinha.
    const apiRes = await callTreasuryApi<UnidadeCadastrada[]>('listar_unidades');
    if (!apiRes.success || !Array.isArray(apiRes.data)) {
      console.warn('Não foi possível carregar as unidades cadastradas:', apiRes.error);
      return memoryUnidades || [];
    }

    const lista = apiRes.data.map((u: any) => ({
      id: String(u.id),
      nome: String(u.nome || '').trim(),
      pai_id: u.pai_id ? String(u.pai_id) : null,
      ativo: u.ativo === true,
      nivel_tipo_id: u.nivel_tipo_id ? String(u.nivel_tipo_id) : null,
      igreja_id: u.igreja_id ? String(u.igreja_id) : null,
      dia_semana: u.dia_semana ? String(u.dia_semana).trim() : null,
      lideres: Array.isArray(u.lideres) ? u.lideres : [],
      lider_nome: u.lider_nome ? String(u.lider_nome).trim() : null,
      eh_celula: typeof u.eh_celula === 'boolean' ? u.eh_celula : null,
      inicio_em: u.inicio_em ? String(u.inicio_em).slice(0, 10) : null,
    }));
    memoryUnidades = lista;
    lastUnidadesFetch = now;
    return lista;
  },

  /**
   * Valida relatório (via /api/treasury). O tesoureiro registrado é o usuário logado,
   * identificado pelo servidor a partir da sessão.
   */
  async confirmarLancamento(
    relatorioId: string,
    userIdLogado: string | number = '',
    dataTesouraria?: string,
    nomeTesoureiro?: string
  ): Promise<{ success: boolean; error?: string }> {
    const res = await callTreasuryApi('confirmar_individual', { id: relatorioId });
    if (!res.success) return { success: false, error: res.error };

    const nowIso = new Date().toISOString();
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    const dataBR = dataTesouraria || `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    if (memoryLancamentos) {
      memoryLancamentos = memoryLancamentos.map((l) =>
        l.id === relatorioId || String(l.ID) === relatorioId
          ? {
              ...l,
              TESOURARIA_RECEB: true,
              tesouraria_recebido: true,
              status: 'CONFIRMADO',
              DATA_TESOURARIA: dataBR,
              data_recebimento: nowIso,
              ID_TESOUREIRO: userIdLogado,
              tesoureiro_id: userIdLogado,
              NomeTesoureiro: nomeTesoureiro || 'Tesoureiro',
            }
          : l
      );
    }
    sincronizarCacheRelatorios();
    return { success: true };
  },

  /**
   * Desfaz validação de relatório (via /api/treasury)
   */
  async desconfirmarLancamento(relatorioId: string): Promise<{ success: boolean; error?: string }> {
    const res = await callTreasuryApi('desconfirmar_individual', { id: relatorioId });
    if (!res.success) return { success: false, error: res.error };

    if (memoryLancamentos) {
      memoryLancamentos = memoryLancamentos.map((l) =>
        l.id === relatorioId || String(l.ID) === relatorioId
          ? {
              ...l,
              TESOURARIA_RECEB: false,
              tesouraria_recebido: false,
              status: 'PENDENTE',
              DATA_TESOURARIA: undefined,
              data_recebimento: undefined,
              ID_TESOUREIRO: undefined,
              tesoureiro_id: undefined,
            }
          : l
      );
    }
    sincronizarCacheRelatorios();
    return { success: true };
  },

  /**
   * Edita os valores (PIX e espécie) de um relatório (via /api/treasury)
   */
  async editarLancamento(
    id: string,
    dados: {
      celula: string;
      data: string;
      pix: number;
      especie: number;
      total: number;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const res = await callTreasuryApi('atualizar_valores', {
      id,
      valorPix: dados.pix,
      valorEspecie: dados.especie,
    });
    if (!res.success) return { success: false, error: res.error };

    if (memoryLancamentos) {
      memoryLancamentos = memoryLancamentos.map((l) =>
        l.id === id || String(l.ID) === id
          ? {
              ...l,
              valorPix: dados.pix,
              ValorOferta: dados.pix,
              valorEspecie: dados.especie,
              OfertaEspecie: dados.especie,
              valorTotal: dados.total,
              Total: dados.total,
            }
          : l
      );
    }
    sincronizarCacheRelatorios();
    return { success: true };
  },

  /**
   * Valida relatórios em lote (via /api/treasury)
   */
  async confirmarLancamentosEmMassa(
    ids: string[],
    userIdLogado: string | number = ''
  ): Promise<{ success: boolean; count?: number; error?: string }> {
    if (!Array.isArray(ids) || ids.length === 0) return { success: true, count: 0 };

    const res = await callTreasuryApi('confirmar_massa', { ids });
    if (!res.success) return { success: false, error: res.error };

    const nowIso = new Date().toISOString();
    if (memoryLancamentos) {
      const idSet = new Set(ids);
      memoryLancamentos = memoryLancamentos.map((l) =>
        idSet.has(l.id) || idSet.has(String(l.ID))
          ? {
              ...l,
              TESOURARIA_RECEB: true,
              tesouraria_recebido: true,
              status: 'CONFIRMADO',
              data_recebimento: nowIso,
              ID_TESOUREIRO: userIdLogado,
              tesoureiro_id: userIdLogado,
            }
          : l
      );
    }
    sincronizarCacheRelatorios();
    return { success: true, count: res.count ?? ids.length };
  },

  /**
   * Exclui um relatório (via /api/treasury)
   */
  async excluirLancamento(id: string): Promise<{ success: boolean; error?: string }> {
    const res = await callTreasuryApi('excluir', { id });
    if (!res.success) return { success: false, error: res.error };

    if (memoryLancamentos) {
      memoryLancamentos = memoryLancamentos.filter((l) => l.id !== id && String(l.ID) !== id);
    }
    sincronizarCacheRelatorios();
    return { success: true };
  },

  /**
   * Lista todos os membros com acesso concedido na tabela tesouraria_permissao
   */
  async fetchTesourariaPermissoes(): Promise<{ success: boolean; data: TesourariaPermissaoItem[]; error?: string }> {
    const res = await callTreasuryApi<TesourariaPermissaoItem[]>('listar_permissoes');
    if (res.success && Array.isArray(res.data)) {
      return { success: true, data: res.data };
    }
    return { success: false, data: [], error: res.error || 'Erro ao carregar permissões.' };
  },

  /**
   * Busca membros na tabela membros da igreja para conceder acesso
   */
  async buscarMembrosIgreja(busca = ''): Promise<{ success: boolean; data: MembroBuscaItem[]; error?: string }> {
    const res = await callTreasuryApi<MembroBuscaItem[]>('buscar_membros', { busca });
    if (res.success && Array.isArray(res.data)) {
      return { success: true, data: res.data };
    }
    return { success: false, data: [], error: res.error || 'Erro ao buscar membros.' };
  },

  /**
   * Adiciona um membro à tabela tesouraria_permissao
   */
  async adicionarPermissaoTesouraria(membroId: string): Promise<{ success: boolean; error?: string; message?: string }> {
    const res = await callTreasuryApi('adicionar_permissao', { membro_id: membroId });
    return { success: Boolean(res.success), error: res.error, message: res.message };
  },

  /**
   * Remove um membro da tabela tesouraria_permissao
   */
  async removerPermissaoTesouraria(params: { id?: string; membro_id?: string }): Promise<{ success: boolean; error?: string }> {
    const res = await callTreasuryApi('remover_permissao', params);
    return { success: Boolean(res.success), error: res.error };
  },

};
