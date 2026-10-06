import { getSupabaseClient } from './supabase';
import { LancamentoTesouraria, PermissaoUsuario, AppChurchUser, MembroItem } from './types';
import { LISTA_CELULAS } from './celulas-data';

// In-memory cache for high performance and reduced query consumption
let memoryLancamentos: LancamentoTesouraria[] | null = null;
let memoryPermissoes: PermissaoUsuario[] | null = null;
let lastLancamentosFetch = 0;
let lastPermissoesFetch = 0;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache (no polling)

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export const MAPA_CELULAS_SETORES: Record<string, string> = {
  'maranata': 'Safira', 'nazireu': 'Safira', 'cordeirinhos kids': 'Safira', 'metanoia': 'Safira', 'efratá': 'Safira', 'tetelestai': 'Safira',
  'frutifera': 'Fire', 'ekklesia': 'Fire', 'jeová jireh': 'Fire', 'elohim': 'Fire', 'huiós': 'Fire', 'adonai': 'Fire', 'barukids': 'Fire', 'baruk': 'Fire', 'brotinhos kids': 'Fire', 'efraim': 'Fire',
  'qahal kids': 'White', 'éden': 'White', 'dunamis': 'White', 'lírios': 'White', 'qahal': 'White', 'boas novas': 'White', 'holy spirit': 'White', 'naham': 'White', 'zion': 'White', 'áquila kids': 'White', 'revolution': 'White', 'be one': 'White', 'oliveiras': 'White', 'áquila': 'White', 'videira': 'White',
  'mel kids': 'Titanium', 'rafá': 'Titanium', 'betel': 'Titanium', 'ágape': 'Titanium',
  'ekballo': 'Legacy', 'galileu': 'Legacy', 'yeshua': 'Legacy', 'jesus people': 'Legacy',
  'zoe kids': 'Black', 'avivah': 'Black', 'hope': 'Black', 'new mindinhos': 'Black', 'filipenses 4:8': 'Black', 'zoe': 'Black', 'filikids': 'Black', 'atos 29': 'Black', 'new mind': 'Black', 'hope kids': 'Black',
  'razak': 'Diamante', 'kairós': 'Diamante', 'gideões': 'Diamante', 'hineni': 'Diamante', 'aba pai': 'Diamante', 'hágios': 'Diamante', 'kairós kids': 'Diamante',
  'rei davi': 'Onix', 'kadosh': 'Onix', 'emaús': 'Onix', 'renovo': 'Onix',
  'geração joão batista': 'Amarelo', 'herdeiros kids': 'Amarelo', 'nova geração eleita': 'Amarelo', 'geração hur kids': 'Amarelo', 'herdeiros da glória': 'Amarelo', 'geração hur': 'Amarelo',
  'life kids': 'Azul', 'geração eleita kids': 'Azul', 'geração eleita': 'Azul', 'sal e luz': 'Azul', 'revigora': 'Azul', 'life': 'Azul', 'new life': 'Azul', 'revigora kids': 'Azul', 'cordeiro de deus': 'Azul', 'nações': 'Azul'
};

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

  const idTesoureiro = item.tesoureiro_id || item.ID_TESOUREIRO || (isConfirmado ? '4' : undefined);

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

  // Cross-reference with LISTA_CELULAS if cell is matched
  if (celulaNome) {
    const norm = celulaNome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const matched = LISTA_CELULAS.find((c) => {
      const cNorm = c.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return norm.includes(cNorm) || cNorm.includes(norm);
    });
    if (matched) {
      celulaNome = matched.nome;
      if (!setor) setor = matched.setor;
      if (!liderCelula) liderCelula = matched.lider;
      if (!area) area = matched.area;
    }
  }

  // Fallback if empty in database
  if (!celulaNome) {
    celulaNome = `Célula #${idx + 1}`;
  }

  if (item.setor || item.setor_nome || item.Setor) {
    setor = String(item.setor || item.setor_nome || item.Setor).trim();
  } else if (celulaNome) {
    const cNorm = celulaNome.toLowerCase().trim();
    if (MAPA_CELULAS_SETORES[cNorm]) {
      setor = MAPA_CELULAS_SETORES[cNorm];
    }
  }

  if (!setor || setor === '-' || setor === 'undefined') {
    setor = 'Safira';
  }

  if (!liderCelula) liderCelula = String(item.lider || item.LiderCelula || item.responsavel_envio || '-').trim();

  // Resolve the validator name accurately from idTesoureiro
  let nomeTesoureiro: string | undefined = undefined;
  if (isConfirmado) {
    const rawNome = item.NomeTesoureiro || item.nome_tesoureiro;
    if (rawNome && String(rawNome).toLowerCase() !== 'tesouraria') {
      nomeTesoureiro = String(rawNome).trim();
    } else {
      const sId = String(idTesoureiro || '').trim().toLowerCase();
      if (sId === '4' || sId === 'junio' || sId === 'jfonteles') {
        nomeTesoureiro = 'Junio Fonteles';
      } else if (sId.includes('developer')) {
        nomeTesoureiro = 'Developer AppChurch';
      } else if (sId === '1' || sId === 'admin') {
        nomeTesoureiro = 'Administrador Geral';
      } else {
        const found = memoryPermissoes?.find((p) => p.id === sId || p.user_id === sId);
        nomeTesoureiro = found ? found.nome : 'Tesoureiro';
      }
    }
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

async function callTreasuryApi(action: string, params: any = {}): Promise<any> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/treasury', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('[callTreasuryApi] Falha na chamada da API:', e);
  }
  return null;
}

export const TreasuryService = {
  /**
   * Limpa cache em memória
   */
  clearCache() {
    memoryLancamentos = null;
    memoryPermissoes = null;
    lastLancamentosFetch = 0;
    lastPermissoesFetch = 0;
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
   * Obtém relatórios semanais da própria igreja via RLS do Supabase
   * Utiliza cache em memória para evitar requisições frequentes
   */
  async fetchRelatorios(
    forceRefresh = false
  ): Promise<{ data: LancamentoTesouraria[]; error?: string }> {
    const now = Date.now();
    if (!forceRefresh && memoryLancamentos && now - lastLancamentosFetch < CACHE_TTL_MS) {
      return { data: memoryLancamentos };
    }

    try {
      const apiRes = await callTreasuryApi('relatorios_detalhados', { ano: 'todos' });
      if (apiRes && apiRes.success && Array.isArray(apiRes.data)) {
        const formatted = apiRes.data.map((item: any, idx: number) => converterItemParaLancamento(item, idx));
        memoryLancamentos = formatted;
        lastLancamentosFetch = now;
        return { data: formatted };
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('relatorios_semanais')
        .select(
          'id, igreja_id, unidade_id, lancado_por, data_relatorio, numero_semana, valor_pix, valor_especie, observacao, qtd_membros, qtd_criancas, data_recebimento, tesoureiro_id, tesouraria_recebido, criado_em, atualizado_em, unidades(id, nome, pai_id)'
        )
        .order('data_relatorio', { ascending: false })
        .limit(10000);

      if (error) {
        console.warn('Aviso ao consultar relatorios_semanais no Supabase:', error.message);
        return { data: memoryLancamentos || [], error: error.message };
      }

      if (data && Array.isArray(data)) {
        const formatted = data.map((item, idx) => converterItemParaLancamento(item, idx));
        memoryLancamentos = formatted;
        lastLancamentosFetch = now;
        return { data: formatted };
      }

      memoryLancamentos = [];
      lastLancamentosFetch = now;
      return { data: [] };
    } catch (err: any) {
      console.warn('Erro ao conectar com Supabase:', err);
      return { data: memoryLancamentos || [], error: err.message };
    }
  },

  /**
   * RPC 1: tesouraria_setores_pendencias
   * Retorna lista de setores da igreja com contagem de relatórios pendentes para o período
   */
  async rpcTesourariaSetoresPendencias(
    ano: number | string,
    mes?: number | string | null
  ): Promise<{
    success: boolean;
    data: { setor_id: string; setor_nome: string; qtd_pendentes: number }[];
    error?: string;
    isAuthError?: boolean;
  }> {
    try {
      const apiRes = await callTreasuryApi('setores_pendencias', { ano, mes });
      if (apiRes && apiRes.success && Array.isArray(apiRes.data)) {
        return { success: true, data: apiRes.data };
      }

      const supabase = getSupabaseClient();
      const isTodosAnos = String(ano).toLowerCase() === 'todos' || String(ano).toLowerCase() === 'todos os anos';
      const pAno = isTodosAnos ? null : Number(ano) || new Date().getFullYear();
      const pMes = mes !== null && mes !== undefined && mes !== 'todos' && mes !== '' ? Number(mes) : null;

      if (!isTodosAnos) {
        const { data, error } = await supabase.rpc('tesouraria_setores_pendencias', {
          p_ano: pAno,
          p_mes: pMes,
        });

        if (!error && Array.isArray(data) && data.length > 0) {
          const list = data.map((item: any) => ({
            setor_id: String(item.setor_id || item.id || ''),
            setor_nome: String(item.setor_nome || item.nome || item.setor || 'Setor').trim(),
            qtd_pendentes: Number(item.qtd_pendentes ?? item.pendentes ?? 0),
          }));
          return { success: true, data: list };
        }
      }

      // Cálculo direto no banco para suportar todos os anos
      const { data: allRows } = await supabase
        .from('relatorios_semanais')
        .select('id, data_relatorio, tesouraria_recebido, observacao')
        .limit(10000);

      const setoresMap = new Map<string, number>();
      const setoresPadrao = ['Safira', 'Fire', 'White', 'Black', 'Azul', 'Amarelo', 'Legacy', 'Onix', 'Diamante', 'Titanium'];
      setoresPadrao.forEach((s) => setoresMap.set(s, 0));

      if (allRows && Array.isArray(allRows)) {
        allRows.forEach((r: any) => {
          let itemAno = new Date().getFullYear();
          let itemMes = new Date().getMonth() + 1;
          if (r.data_relatorio) {
            const clean = String(r.data_relatorio).split('T')[0];
            const parts = clean.split('-');
            if (parts.length === 3) {
              itemAno = parseInt(parts[0], 10);
              itemMes = parseInt(parts[1], 10);
            }
          }

          if (!isTodosAnos && pAno !== null && itemAno !== pAno) return;
          if (pMes !== null && itemMes !== pMes) return;

          // Contabiliza apenas pendentes (tesouraria_recebido !== true)
          if (r.tesouraria_recebido !== true) {
            let setor = 'Safira';
            const obs = String(r.observacao || '');
            if (obs.toLowerCase().includes('setor:')) {
              const match = obs.match(/setor:\s*([^|]+)/i);
              if (match) setor = match[1].trim();
            }
            setoresMap.set(setor, (setoresMap.get(setor) || 0) + 1);
          }
        });
      }

      const list = Array.from(setoresMap.entries()).map(([nome, qtd]) => ({
        setor_id: nome,
        setor_nome: nome,
        qtd_pendentes: qtd,
      }));

      return { success: true, data: list };
    } catch (err: any) {
      console.warn('Exceção RPC tesouraria_setores_pendencias:', err);
      return { success: false, data: [], error: err?.message, isAuthError: false };
    }
  },

  /**
   * RPC 2: tesouraria_relatorios_detalhados
   * Retorna os relatórios detalhados da igreja para a tabela principal
   * Busca no banco inteiro (limit 10000) e valida exclusivamente via tesouraria_recebido === true
   */
  async rpcTesourariaRelatoriosDetalhados(
    ano: number | string,
    mes?: number | string | null,
    setorId?: string | null,
    somentePendentes?: boolean | null
  ): Promise<{
    success: boolean;
    data: {
      id: string;
      unidade_id?: string;
      celula_nome: string;
      lideres: string;
      data_relatorio: string;
      valor_pix: number;
      valor_especie: number;
      tesouraria_recebido: boolean;
      data_recebimento?: string | null;
      tesoureiro_id?: string | null;
      nome_tesoureiro?: string | null;
    }[];
    error?: string;
    isAuthError?: boolean;
  }> {
    try {
      const apiRes = await callTreasuryApi('relatorios_detalhados', {
        ano,
        mes,
        setorId,
        somentePendentes,
      });
      if (apiRes && apiRes.success && Array.isArray(apiRes.data)) {
        return { success: true, data: apiRes.data };
      }

      const supabase = getSupabaseClient();
      const isTodosAnos = String(ano).toLowerCase() === 'todos' || String(ano).toLowerCase() === 'todos os anos';
      const pAno = isTodosAnos ? null : Number(ano) || new Date().getFullYear();
      const pMes = mes !== null && mes !== undefined && mes !== 'todos' && mes !== '' ? Number(mes) : null;
      const pSetorId = setorId && setorId !== 'todos' ? String(setorId) : null;
      const pSomentePendentes = typeof somentePendentes === 'boolean' ? somentePendentes : null;

      // 1. Tenta RPC
      let rpcList: any[] = [];
      let rpcSuccess = false;
      if (!isTodosAnos) {
        try {
          const { data, error } = await supabase.rpc('tesouraria_relatorios_detalhados', {
            p_ano: pAno,
            p_mes: pMes,
            p_setor_id: pSetorId,
            p_somente_pendentes: pSomentePendentes,
          });

          if (!error && Array.isArray(data)) {
            rpcList = data;
            rpcSuccess = true;
          }
        } catch {}
      }

      // Se a RPC retornou mais de 100 registros (sem limite truncado)
      if (rpcSuccess && rpcList.length > 100) {
        const list = rpcList.map((item: any) => ({
          id: String(item.id),
          unidade_id: item.unidade_id ? String(item.unidade_id) : undefined,
          celula_nome: String(item.celula_nome || 'Célula').trim(),
          lideres: String(item.lideres || '-').trim(),
          data_relatorio: item.data_relatorio || '',
          valor_pix: Number(item.valor_pix ?? 0),
          valor_especie: Number(item.valor_especie ?? 0),
          tesouraria_recebido: item.tesouraria_recebido === true,
          data_recebimento: item.data_recebimento || null,
          tesoureiro_id: item.tesoureiro_id || null,
          nome_tesoureiro: item.nome_tesoureiro || null,
        }));
        return { success: true, data: list };
      }

      // 2. Consulta direta à tabela relatorios_semanais para buscar no BANCO INTEIRO (sem limite de 100)
      let query = supabase
        .from('relatorios_semanais')
        .select('id, igreja_id, data_relatorio, numero_semana, valor_pix, valor_especie, observacao, data_recebimento, tesoureiro_id, tesouraria_recebido, criado_em')
        .order('data_relatorio', { ascending: false })
        .limit(10000);

      if (pSomentePendentes === true) {
        query = query.or('tesouraria_recebido.eq.false,tesouraria_recebido.is.null');
      } else if (pSomentePendentes === false) {
        query = query.eq('tesouraria_recebido', true);
      }

      const { data, error } = await query;

      if (error) {
        if (rpcSuccess) {
          const list = rpcList.map((item: any) => ({
            id: String(item.id),
            unidade_id: item.unidade_id ? String(item.unidade_id) : undefined,
            celula_nome: String(item.celula_nome || 'Célula').trim(),
            lideres: String(item.lideres || '-').trim(),
            data_relatorio: item.data_relatorio || '',
            valor_pix: Number(item.valor_pix ?? 0),
            valor_especie: Number(item.valor_especie ?? 0),
            tesouraria_recebido: item.tesouraria_recebido === true,
            data_recebimento: item.data_recebimento || null,
            tesoureiro_id: item.tesoureiro_id || null,
            nome_tesoureiro: item.nome_tesoureiro || null,
          }));
          return { success: true, data: list };
        }
        return { success: false, data: [], error: error.message };
      }

      if (data && Array.isArray(data)) {
        let itemsFiltrados = data;

        // Filtro por Ano / Mês
        itemsFiltrados = itemsFiltrados.filter((item: any) => {
          let itemAno = new Date().getFullYear();
          let itemMes = new Date().getMonth() + 1;
          if (item.data_relatorio) {
            const clean = String(item.data_relatorio).split('T')[0];
            const parts = clean.split('-');
            if (parts.length === 3) {
              itemAno = parseInt(parts[0], 10);
              itemMes = parseInt(parts[1], 10);
            }
          }

          if (!isTodosAnos && pAno !== null && itemAno !== pAno) return false;
          if (pMes !== null && itemMes !== pMes) return false;
          return true;
        });

        const list = itemsFiltrados.map((item: any, idx: number) => {
          const l = converterItemParaLancamento(item, idx);
          return {
            id: String(item.id),
            unidade_id: item.unidade_id ? String(item.unidade_id) : undefined,
            celula_nome: String(l.celulaNome || 'Célula'),
            lideres: String(l.liderCelula || '-'),
            data_relatorio: String(item.data_relatorio || l.data),
            valor_pix: Number(item.valor_pix ?? 0),
            valor_especie: Number(item.valor_especie ?? 0),
            tesouraria_recebido: item.tesouraria_recebido === true,
            data_recebimento: item.data_recebimento || null,
            tesoureiro_id: item.tesoureiro_id || null,
            nome_tesoureiro: l.NomeTesoureiro || null,
          };
        });

        return { success: true, data: list };
      }

      return { success: true, data: [] };
    } catch (err: any) {
      console.warn('Exceção ao buscar relatórios detalhados no banco inteiro:', err);
      return { success: false, data: [], error: err?.message, isAuthError: false };
    }
  },

  /**
   * RPC 3: tesouraria_resumo
   * Retorna os contadores do topo da tela: { pendentes, confirmados }
   * Calculado no banco inteiro baseado em tesouraria_recebido
   */
  async rpcTesourariaResumo(
    ano: number | string,
    mes?: number | string | null
  ): Promise<{
    success: boolean;
    data: { pendentes: number; confirmados: number };
    error?: string;
    isAuthError?: boolean;
  }> {
    try {
      const apiRes = await callTreasuryApi('resumo', { ano, mes });
      if (apiRes && apiRes.success && apiRes.data) {
        return { success: true, data: apiRes.data };
      }

      const supabase = getSupabaseClient();
      const isTodosAnos = String(ano).toLowerCase() === 'todos' || String(ano).toLowerCase() === 'todos os anos';
      const pAno = isTodosAnos ? null : Number(ano) || new Date().getFullYear();
      const pMes = mes !== null && mes !== undefined && mes !== 'todos' && mes !== '' ? Number(mes) : null;

      // 1. Tenta RPC se ano específico
      if (!isTodosAnos) {
        try {
          const { data, error } = await supabase.rpc('tesouraria_resumo', {
            p_ano: pAno,
            p_mes: pMes,
          });

          if (!error && data) {
            let row = { pendentes: 0, confirmados: 0 };
            if (Array.isArray(data) && data.length > 0) {
              row = {
                pendentes: Number(data[0].pendentes ?? 0),
                confirmados: Number(data[0].confirmados ?? 0),
              };
            } else if (typeof data === 'object') {
              row = {
                pendentes: Number((data as any).pendentes ?? 0),
                confirmados: Number((data as any).confirmados ?? 0),
              };
            }
            if (row.pendentes > 0 || row.confirmados > 0) {
              return { success: true, data: row };
            }
          }
        } catch {}
      }

      // 2. Cálculo direto no banco de relatorios_semanais baseado em tesouraria_recebido
      const { data: allRows, error: errAll } = await supabase
        .from('relatorios_semanais')
        .select('id, data_relatorio, tesouraria_recebido')
        .limit(10000);

      if (errAll) {
        return { success: false, data: { pendentes: 0, confirmados: 0 }, error: errAll.message };
      }

      let pendentes = 0;
      let confirmados = 0;

      if (allRows && Array.isArray(allRows)) {
        allRows.forEach((r: any) => {
          let itemAno = new Date().getFullYear();
          let itemMes = new Date().getMonth() + 1;
          if (r.data_relatorio) {
            const clean = String(r.data_relatorio).split('T')[0];
            const parts = clean.split('-');
            if (parts.length === 3) {
              itemAno = parseInt(parts[0], 10);
              itemMes = parseInt(parts[1], 10);
            }
          }

          if (!isTodosAnos && pAno !== null && itemAno !== pAno) return;
          if (pMes !== null && itemMes !== pMes) return;

          if (r.tesouraria_recebido === true) {
            confirmados++;
          } else {
            pendentes++;
          }
        });
      }

      return { success: true, data: { pendentes, confirmados } };
    } catch (err: any) {
      console.warn('Exceção tesouraria_resumo:', err);
      return { success: false, data: { pendentes: 0, confirmados: 0 }, error: err?.message, isAuthError: false };
    }
  },

  /**
   * Obtém setores / unidades cadastrados para a igreja na tabela 'unidades'
   */
  async fetchUnidades(
    igrejaId?: string | number
  ): Promise<{ success: boolean; data: string[]; error?: string }> {
    try {
      const supabase = getSupabaseClient();
      let query = supabase.from('unidades').select('*');

      if (igrejaId && String(igrejaId).trim()) {
        const idStr = String(igrejaId).trim();
        query = query.eq('igreja_id', idStr);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Aviso ao consultar tabela unidades:', error.message);
        return { success: false, data: [], error: error.message };
      }

      if (data && Array.isArray(data)) {
        const setoresSet = new Set<string>();
        data.forEach((u: any) => {
          const nome = String(
            u.nome || u.nome_unidade || u.setor || u.titulo || u.descricao || u.name || ''
          ).trim();
          if (nome && nome !== '-' && nome !== 'undefined' && nome !== 'null') {
            setoresSet.add(nome);
          }
        });
        return { success: true, data: Array.from(setoresSet).sort() };
      }

      return { success: true, data: [] };
    } catch (err: any) {
      console.warn('Erro ao consultar unidades no Supabase:', err);
      return { success: false, data: [], error: err.message };
    }
  },

  /**
   * Valida relatório no Supabase (UPDATE controlado por RLS)
   */
  async confirmarLancamento(
    relatorioId: string,
    userIdLogado: string | number = '1',
    dataTesouraria?: string,
    nomeTesoureiro?: string
  ): Promise<{ success: boolean; error?: string }> {
    const nowIso = new Date().toISOString();
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    const dataBR = dataTesouraria || `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    const nomeFinal = nomeTesoureiro || 'Tesoureiro';

    // Atualização otimista em memória
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
              NomeTesoureiro: nomeFinal,
            }
          : l
      );
    }

    try {
      const apiRes = await callTreasuryApi('confirmar_individual', { id: relatorioId, userId: userIdLogado });
      if (apiRes && apiRes.success) {
        return { success: true };
      }

      const isUUID = UUID_REGEX.test(relatorioId);
      if (isUUID) {
        const supabase = getSupabaseClient();
        const { error } = await supabase
          .from('relatorios_semanais')
          .update({
            tesouraria_recebido: true,
            data_recebimento: nowIso,
            tesoureiro_id: String(userIdLogado),
            atualizado_em: nowIso,
          })
          .eq('id', relatorioId);

        if (error) {
          if (
            error.code === '42501' ||
            error.message?.includes('row-level security') ||
            error.message?.includes('permission denied')
          ) {
            return {
              success: false,
              error:
                'Você não possui permissão de tesouraria cadastrada para validar relatórios. Solicite a liberação à liderança da igreja.',
            };
          }
          console.warn('Erro ao confirmar no Supabase:', error.message);
          return { success: false, error: error.message };
        }
      }
      return { success: true };
    } catch (err: any) {
      console.warn('Erro ao confirmar relatório no Supabase:', err);
      return { success: false, error: err?.message || 'Falha ao confirmar relatório.' };
    }
  },

  /**
   * Desfaz validação de relatório (UPDATE com tesouraria_recebido: false)
   */
  async desconfirmarLancamento(relatorioId: string): Promise<{ success: boolean; error?: string }> {
    const nowIso = new Date().toISOString();

    // Atualização otimista em memória
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

    try {
      const apiRes = await callTreasuryApi('desconfirmar_individual', { id: relatorioId });
      if (apiRes && apiRes.success) {
        return { success: true };
      }

      const isUUID = UUID_REGEX.test(relatorioId);
      if (isUUID) {
        const supabase = getSupabaseClient();
        const { error } = await supabase
          .from('relatorios_semanais')
          .update({
            tesouraria_recebido: false,
            data_recebimento: null,
            tesoureiro_id: null,
            atualizado_em: nowIso,
          })
          .eq('id', relatorioId);

        if (error) {
          if (
            error.code === '42501' ||
            error.message?.includes('row-level security') ||
            error.message?.includes('permission denied')
          ) {
            return {
              success: false,
              error:
                'Você não possui permissão de tesouraria cadastrada para reverter validações. Solicite a liberação à liderança da igreja.',
            };
          }
          console.warn('Erro ao desconfirmar no Supabase:', error.message);
          return { success: false, error: error.message };
        }
      }
      return { success: true };
    } catch (err: any) {
      console.warn('Erro ao desconfirmar relatório no Supabase:', err);
      return { success: false, error: err?.message || 'Falha ao desconfirmar relatório.' };
    }
  },

  /**
   * Edita dados de um relatório (Data, PIX, Espécie, Observação)
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
    if (memoryLancamentos) {
      memoryLancamentos = memoryLancamentos.map((l) =>
        l.id === id || String(l.ID) === id
          ? {
              ...l,
              celulaNome: dados.celula,
              Célula: dados.celula,
              dataBR: dados.data,
              data: dados.data,
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

    try {
      const apiRes = await callTreasuryApi('atualizar_valores', {
        id,
        valorPix: dados.pix,
        valorEspecie: dados.especie,
      });
      if (apiRes && apiRes.success) {
        return { success: true };
      }

      const isUUID = UUID_REGEX.test(id);
      if (isUUID) {
        const supabase = getSupabaseClient();
        const { error } = await supabase
          .from('relatorios_semanais')
          .update({
            data_relatorio: dados.data,
            valor_pix: dados.pix,
            valor_especie: dados.especie,
            observacao: dados.celula,
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', id);

        if (error) {
          console.warn('Erro ao editar relatório no Supabase:', error.message);
          return { success: false, error: error.message };
        }
      }
      return { success: true };
    } catch (err: any) {
      console.warn('Erro ao editar relatório no Supabase:', err);
      return { success: false, error: err?.message || 'Falha ao editar relatório.' };
    }
  },

  /**
   * Valida relatórios em lote no Supabase
   */
  async confirmarLancamentosEmMassa(
    ids: string[],
    userIdLogado: string | number = '1'
  ): Promise<{ success: boolean; count?: number; error?: string }> {
    if (!Array.isArray(ids) || ids.length === 0) return { success: true, count: 0 };
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

    try {
      const apiRes = await callTreasuryApi('confirmar_massa', { ids, userId: userIdLogado });
      if (apiRes && apiRes.success) {
        return { success: true, count: apiRes.count || ids.length };
      }

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('relatorios_semanais')
        .update({
          tesouraria_recebido: true,
          data_recebimento: nowIso,
          tesoureiro_id: String(userIdLogado),
          atualizado_em: nowIso,
        })
        .in('id', ids);

      if (error) {
        console.warn('Erro ao confirmar em massa no Supabase:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true, count: ids.length };
    } catch (err: any) {
      console.warn('Erro ao confirmar em massa:', err);
      return { success: false, error: err?.message || 'Falha ao confirmar relatórios em lote.' };
    }
  },

  /**
   * Exclui um relatório
   */
  async excluirLancamento(id: string): Promise<{ success: boolean; error?: string }> {
    if (memoryLancamentos) {
      memoryLancamentos = memoryLancamentos.filter((l) => l.id !== id && String(l.ID) !== id);
    }

    try {
      const apiRes = await callTreasuryApi('excluir', { id });
      if (apiRes && apiRes.success) {
        return { success: true };
      }

      const isUUID = UUID_REGEX.test(id);
      if (isUUID) {
        const supabase = getSupabaseClient();
        const { error } = await supabase
          .from('relatorios_semanais')
          .delete()
          .eq('id', id);

        if (error) {
          console.warn('Erro ao excluir no Supabase:', error.message);
          return { success: false, error: error.message };
        }
      }
      return { success: true };
    } catch (err: any) {
      console.warn('Erro ao excluir relatório no Supabase:', err);
      return { success: false, error: err?.message || 'Falha ao excluir relatório.' };
    }
  },

  /**
   * Busca lista de células cadastradas
   */
  getCelulas() {
    return LISTA_CELULAS;
  },

  /**
   * Busca usuários e permissões da tabela permissoes no Supabase
   */
  async fetchPermissoes(forceRefresh = false): Promise<{ data: PermissaoUsuario[]; error?: string }> {
    const now = Date.now();
    if (!forceRefresh && memoryPermissoes && now - lastPermissoesFetch < CACHE_TTL_MS) {
      return { data: memoryPermissoes };
    }

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('permissoes')
        .select('id, codigo, nome, modulo, descricao, criado_em');

      if (!error && data && data.length > 0) {
        const formatted: PermissaoUsuario[] = data.map((item: any) => ({
          id: String(item.id || ''),
          user_id: String(item.id || ''),
          email: `${String(item.codigo || 'user').replace(':', '.')}@pazchurch.com`,
          nome: String(item.nome || item.descricao || 'Usuário'),
          cargo: String(item.modulo || 'Tesouraria'),
          congregacao_nome: 'Safira',
          setor: 'Safira',
          perfil: 'tesoureiro_congregacao',
          acesso_tesouraria_ativo: true,
          permissoes: {
            validar_relatorios: true,
            rejeitar_relatorios: true,
            editar_envelopes: true,
            visualizar_dashboard: true,
            gerenciar_permissoes: false,
            exportar_dados: true,
            excluir_relatorios: false,
            auditar_conferencia: true,
          },
          criado_em: String(item.criado_em || new Date().toISOString().slice(0, 10)),
        }));

        memoryPermissoes = formatted;
        lastPermissoesFetch = now;
        return { data: formatted };
      }
      return { data: [] };
    } catch (err: any) {
      console.warn('Erro ao consultar permissoes:', err);
      return { data: memoryPermissoes || [], error: err.message };
    }
  },

  /**
   * Atualiza permissões de um usuário
   */
  async updatePermissaoUsuario(usuario: PermissaoUsuario): Promise<boolean> {
    if (memoryPermissoes) {
      memoryPermissoes = memoryPermissoes.map((u) => (u.id === usuario.id ? usuario : u));
    }

    try {
      const isUUID = UUID_REGEX.test(usuario.id);
      if (isUUID) {
        const supabase = getSupabaseClient();
        await supabase
          .from('permissoes')
          .update({
            nome: usuario.nome,
            descricao: usuario.cargo,
          })
          .eq('id', usuario.id);
      }
      return true;
    } catch (err) {
      console.warn('Erro ao atualizar permissão no Supabase:', err);
      return false;
    }
  },

  /**
   * Cadastra novo usuário na lista de permissões
   */
  async createPermissaoUsuario(novoUsuario: PermissaoUsuario): Promise<boolean> {
    if (memoryPermissoes) {
      memoryPermissoes = [novoUsuario, ...memoryPermissoes];
    }

    try {
      const supabase = getSupabaseClient();
      await supabase.from('permissoes').insert([
        {
          codigo: `user:${novoUsuario.email.split('@')[0]}`,
          nome: novoUsuario.nome,
          modulo: novoUsuario.cargo,
          descricao: novoUsuario.cargo,
        },
      ]);
      return true;
    } catch (err) {
      console.warn('Erro ao cadastrar permissão no Supabase:', err);
      return false;
    }
  },
};
