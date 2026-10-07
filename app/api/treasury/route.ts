import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { converterItemParaLancamento, SEM_SETOR } from '@/lib/treasury-service';

/**
 * API da Tesouraria.
 *
 * Segurança: toda chamada precisa do token de sessão do Supabase
 * (Authorization: Bearer <access_token>), obtido no login pelo AppChurch.
 * A rota identifica o membro (membros.auth_user_id), exige uma linha em
 * tesouraria_permissao para a igreja dele e SEMPRE filtra por essa igreja_id —
 * mesmas regras das RPCs tesouraria_* no banco.
 *
 * Consumo: os filtros de período e igreja são feitos no banco, as leituras são
 * paginadas (o Supabase devolve no máx. 1000 linhas por consulta) e a tela de
 * validação usa uma única ação ("painel_validacao") por período.
 */

const PAGE_SIZE = 1000;
const MAX_ROWS = 20000;
const CACHE_TTL_MS = 5 * 60 * 1000; // unidades e membros por igreja
const CACHE_MAX_IGREJAS = 200;
const AUTH_CACHE_TTL_MS = 2 * 60 * 1000; // sessão e permissão: acesso removido deixa de valer em até 2 min
const AUTH_CACHE_MAX = 5000;
const LIMITE_REQ_POR_MINUTO = 120; // por usuário, por instância do servidor
const FILTRO_PENDENTE = 'tesouraria_recebido.is.null,tesouraria_recebido.eq.false';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUNAS_RELATORIO =
  'id, unidade_id, lancado_por, data_relatorio, numero_semana, valor_pix, valor_especie, observacao, data_recebimento, tesoureiro_id, tesouraria_recebido, criado_em';

type Unidade = {
  id: string;
  nome: string;
  pai_id?: string | null;
  setor_nome?: string;
  lideres?: string[];
  lider_nome?: string | null;
};
type Membro = { id: string; nome: string; igreja_id: string; podeGerenciarPermissoes: boolean };

/** Códigos do AppChurch (tabela permissoes) que liberam a gestão de acessos da tesouraria. */
const CODIGOS_ADMIN = ['church:admin', 'permissions:manage'];

/**
 * Cache em memória com validade e tamanho máximo. Ao lotar, descarta só os
 * itens mais antigos (antes o cache de sessão era zerado inteiro a cada 500
 * usuários, o que com muitas igrejas deixava-o sempre vazio).
 * Observação: é por instância do servidor; em várias instâncias cada uma tem o seu.
 */
class CacheLimitado<V> {
  private itens = new Map<string, { valor: V; at: number }>();
  constructor(private max: number, private ttlMs: number) {}

  get(chave: string): V | undefined {
    const item = this.itens.get(chave);
    if (!item) return undefined;
    if (Date.now() - item.at >= this.ttlMs) {
      this.itens.delete(chave);
      return undefined;
    }
    return item.valor;
  }

  set(chave: string, valor: V) {
    this.itens.delete(chave);
    this.itens.set(chave, { valor, at: Date.now() });
    while (this.itens.size > this.max) {
      this.itens.delete(this.itens.keys().next().value as string);
    }
  }

  deleteWhere(teste: (valor: V) => boolean) {
    this.itens.forEach((item, chave) => {
      if (teste(item.valor)) this.itens.delete(chave);
    });
  }
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Cliente administrativo (só no servidor)
// ---------------------------------------------------------------------------

let adminClient: SupabaseClient | null = null;

const DEFAULT_SUPABASE_URL = 'https://srjkwwddbxniqhzqvrhc.supabase.co';
// A chave de serviço só é aceita de variáveis exclusivas do servidor.
// Variáveis NEXT_PUBLIC_* são embutidas no código do navegador e NUNCA devem guardar segredos.
const ENV_CHAVE = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY'] as const;
const ENV_URL = ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'] as const;

/** true para chave secreta nova (sb_secret_...) ou JWT legado com role "service_role". */
function ehChaveDeServico(valor: string): boolean {
  if (valor.startsWith('sb_secret_')) return true;
  const partes = valor.split('.');
  if (partes.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(partes[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const url =
    ENV_URL.map((n) => process.env[n]?.trim() || '').find((v) => /^https?:\/\//i.test(v)) || DEFAULT_SUPABASE_URL;
  const chave = ENV_CHAVE.map((nome) => ({ nome, valor: process.env[nome]?.trim() || '' })).find(
    (v) => v.valor && ehChaveDeServico(v.valor)
  );

  if (!chave) {
    throw new HttpError(
      500,
      'Servidor sem a chave de serviço do Supabase. Cadastre a "secret key" do projeto na variável SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  adminClient = createClient(url, chave.valor, { auth: { persistSession: false, autoRefreshToken: false } });
  return adminClient;
}

// ---------------------------------------------------------------------------
// Autenticação + permissão de tesouraria
// ---------------------------------------------------------------------------

const authCache = new CacheLimitado<Membro>(AUTH_CACHE_MAX, AUTH_CACHE_TTL_MS);

// Limite simples de requisições por usuário (protege o banco de loops e abusos).
// Em várias instâncias o limite vale por instância; para limite global, usar Redis/Upstash.
const contadorRequisicoes = new CacheLimitado<{ inicio: number; qtd: number }>(AUTH_CACHE_MAX, 60 * 1000);

function verificarLimite(membroId: string) {
  const agora = Date.now();
  const atual = contadorRequisicoes.get(membroId);
  if (!atual || agora - atual.inicio >= 60 * 1000) {
    contadorRequisicoes.set(membroId, { inicio: agora, qtd: 1 });
    return;
  }
  atual.qtd++;
  if (atual.qtd > LIMITE_REQ_POR_MINUTO) {
    throw new HttpError(429, 'Muitas requisições em pouco tempo. Aguarde um minuto e tente novamente.');
  }
}

function invalidarSessoesDoMembro(membroId: string) {
  authCache.deleteWhere((m) => m.id === membroId);
}

async function autenticar(req: NextRequest, supabase: SupabaseClient): Promise<Membro> {
  const header = req.headers.get('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Sessão ausente. Faça login novamente.');

  const cached = authCache.get(token);
  if (cached) return cached;

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) throw new HttpError(401, 'Sessão expirada. Faça login novamente.');

  const { data: membro } = await supabase
    .from('membros')
    .select('id, nome, igreja_id, acesso_ativo, papel_id')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();

  if (!membro || !membro.igreja_id || membro.acesso_ativo === false) {
    throw new HttpError(403, 'Usuário sem acesso ativo ao AppChurch.');
  }

  const { data: perm } = await supabase
    .from('tesouraria_permissao')
    .select('id')
    .eq('membro_id', membro.id)
    .eq('igreja_id', membro.igreja_id)
    .limit(1)
    .maybeSingle();

  if (!perm) {
    throw new HttpError(403, 'Usuário sem permissão de acesso à Tesouraria. Solicite a liberação à liderança da igreja.');
  }

  const result: Membro = {
    id: String(membro.id),
    nome: String(membro.nome || ''),
    igreja_id: String(membro.igreja_id),
    podeGerenciarPermissoes: await temPermissaoAdmin(supabase, String(membro.id), membro.papel_id),
  };
  authCache.set(token, result);
  return result;
}

/**
 * true se o membro tem church:admin ou permissions:manage pelo papel
 * (papel_permissoes) ou por concessão individual (membro_permissoes).
 * Uma linha individual com concedida = false revoga o que vem do papel.
 */
async function temPermissaoAdmin(supabase: SupabaseClient, membroId: string, papelId: string | null): Promise<boolean> {
  const { data: codigos, error } = await supabase.from('permissoes').select('id').in('codigo', CODIGOS_ADMIN);
  if (error || !codigos?.length) return false;
  const ids = codigos.map((c: any) => c.id);

  const [individual, doPapel] = await Promise.all([
    supabase.from('membro_permissoes').select('permissao_id, concedida').eq('membro_id', membroId).in('permissao_id', ids),
    papelId
      ? supabase.from('papel_permissoes').select('permissao_id').eq('papel_id', papelId).in('permissao_id', ids)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const revogadas = new Set((individual.data || []).filter((r: any) => r.concedida === false).map((r: any) => r.permissao_id));
  const concedidas = [
    ...(individual.data || []).filter((r: any) => r.concedida !== false).map((r: any) => r.permissao_id),
    ...(doPapel.data || []).map((r: any) => r.permissao_id),
  ];
  return concedidas.some((id) => !revogadas.has(id));
}

function exigirAdmin(membro: Membro) {
  if (!membro.podeGerenciarPermissoes) {
    throw new HttpError(403, 'Apenas a liderança da igreja (administrador) pode gerenciar acessos à Tesouraria.');
  }
}

// ---------------------------------------------------------------------------
// Utilitários de consulta
// ---------------------------------------------------------------------------

/**
 * Busca todas as linhas de uma consulta, página por página (limite do Supabase: 1000 por vez).
 * Passando de MAX_ROWS, falha com erro claro em vez de devolver dados cortados
 * (totais errados sem aviso são piores que um erro numa tesouraria).
 */
async function buscarTodos<T = any>(montarConsulta: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await montarConsulta().range(from, from + PAGE_SIZE - 1);
    if (error) throw new HttpError(400, error.message);
    const rows = (data || []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
    if (out.length >= MAX_ROWS) {
      throw new HttpError(
        413,
        `O período escolhido tem mais de ${MAX_ROWS.toLocaleString('pt-BR')} registros. Escolha um ano ou mês específico.`
      );
    }
  }
}

const unidadesCache = new CacheLimitado<Map<string, Unidade>>(CACHE_MAX_IGREJAS, CACHE_TTL_MS);
const membrosCache = new CacheLimitado<Map<string, string>>(CACHE_MAX_IGREJAS, CACHE_TTL_MS);

/**
 * Nomes dos líderes por unidade, SOMENTE da igreja informada.
 * unidade_lideres não tem igreja_id: o filtro é feito pelo join com unidades.
 * Membros são paginados (o Supabase devolve no máx. 1000 linhas por consulta).
 */
async function carregarLideresPorUnidade(supabase: SupabaseClient, igrejaId: string) {
  const [lideres, membros] = await Promise.all([
    buscarTodos<any>(() =>
      supabase
        .from('unidade_lideres')
        .select('id, unidade_id, pessoa_id, unidades!inner(igreja_id)')
        .eq('ativo', true)
        .eq('unidades.igreja_id', igrejaId)
        .order('id')
    ),
    buscarTodos<any>(() =>
      supabase.from('membros').select('id, nome, unidade_id, funcao').eq('igreja_id', igrejaId).order('id')
    ),
  ]);

  const nomes = new Map<string, string>();
  membros.forEach((m) => {
    if (m.id && m.nome) nomes.set(String(m.id), String(m.nome).trim());
  });

  const porUnidade = new Map<string, string[]>();
  const adicionar = (unidadeId: string, nome: string) => {
    const lista = porUnidade.get(unidadeId) || [];
    if (!lista.includes(nome)) lista.push(nome);
    porUnidade.set(unidadeId, lista);
  };
  lideres.forEach((ul) => {
    const nome = nomes.get(String(ul.pessoa_id));
    if (nome) adicionar(String(ul.unidade_id), nome);
  });
  membros.forEach((m) => {
    if (m.unidade_id && m.nome && String(m.funcao || '').toLowerCase().includes('lider')) {
      adicionar(String(m.unidade_id), String(m.nome).trim());
    }
  });
  return porUnidade;
}

async function getUnidadesMap(supabase: SupabaseClient, igrejaId: string) {
  const emCache = unidadesCache.get(igrejaId);
  if (emCache) return emCache;
  const [rows, lideresPorUnidade] = await Promise.all([
    buscarTodos<Unidade>(() =>
      supabase.from('unidades').select('id, nome, pai_id').eq('igreja_id', igrejaId).order('id')
    ),
    carregarLideresPorUnidade(supabase, igrejaId),
  ]);

  const map = new Map<string, Unidade>();
  rows.forEach((u) => {
    const lids = lideresPorUnidade.get(String(u.id)) || [];
    map.set(String(u.id), {
      ...u,
      lideres: lids,
      lider_nome: lids.join(', ') || null,
    });
  });
  map.forEach((u) => {
    if (u.pai_id && map.has(String(u.pai_id))) u.setor_nome = map.get(String(u.pai_id))?.nome;
  });
  unidadesCache.set(igrejaId, map);
  return map;
}

async function getMembrosMap(supabase: SupabaseClient, igrejaId: string) {
  const emCache = membrosCache.get(igrejaId);
  if (emCache) return emCache;
  const rows = await buscarTodos<{ id: string; nome: string }>(() =>
    supabase.from('membros').select('id, nome').eq('igreja_id', igrejaId).order('id')
  );
  const map = new Map<string, string>();
  rows.forEach((m) => map.set(String(m.id), String(m.nome)));
  membrosCache.set(igrejaId, map);
  return map;
}

/** Converte ano/mês da tela em intervalo de datas para filtrar no banco. */
function resolverPeriodo(ano: any, mes: any) {
  const anoStr = String(ano ?? '').toLowerCase();
  const todosAnos = !ano || anoStr === 'todos' || anoStr === 'todos os anos';
  const pMes = mes !== null && mes !== undefined && mes !== 'todos' && mes !== '' ? Number(mes) : null;
  const pAno = todosAnos ? null : Number(ano) || new Date().getFullYear();
  const pad = (n: number) => String(n).padStart(2, '0');

  let inicio: string | null = null;
  let fim: string | null = null; // exclusivo
  if (pAno !== null) {
    if (pMes) {
      inicio = `${pAno}-${pad(pMes)}-01`;
      fim = pMes === 12 ? `${pAno + 1}-01-01` : `${pAno}-${pad(pMes + 1)}-01`;
    } else {
      inicio = `${pAno}-01-01`;
      fim = `${pAno + 1}-01-01`;
    }
  }
  return { todosAnos, pAno, pMes, inicio, fim };
}

function anoMesDoItem(dataRelatorio: any) {
  let ano = new Date().getFullYear();
  let mes = new Date().getMonth() + 1;
  if (dataRelatorio) {
    const parts = String(dataRelatorio).split('T')[0].split('-');
    if (parts.length === 3) {
      ano = parseInt(parts[0], 10);
      mes = parseInt(parts[1], 10);
    }
  }
  return { ano, mes };
}

/** Setor = unidade pai da célula (cadastro da própria igreja). Sem pai: tenta a observação. */
function resolverSetor(u: Unidade | null | undefined, observacao: any) {
  if (u?.setor_nome) return u.setor_nome;
  const match = String(observacao || '').match(/setor:\s*([^|]+)/i);
  return match ? match[1].trim() : SEM_SETOR;
}

/** Setores da igreja: unidades pai das unidades da ponta (células). */
function setoresDaIgreja(unidades: Map<string, Unidade>): string[] {
  const pais = new Set<string>();
  unidades.forEach((u) => u.pai_id && pais.add(String(u.pai_id)));
  const setores = new Set<string>();
  unidades.forEach((u) => {
    if (!pais.has(String(u.id)) && u.setor_nome) setores.add(u.setor_nome);
  });
  return Array.from(setores).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Lê os relatórios da igreja no período (filtro no banco) e já monta as linhas da tela. */
async function carregarRelatorios(
  supabase: SupabaseClient,
  igrejaId: string,
  params: { ano?: any; mes?: any; somentePendentes?: any; setorId?: any }
) {
  const { inicio, fim, pMes, todosAnos } = resolverPeriodo(params.ano, params.mes);
  const somentePendentes = typeof params.somentePendentes === 'boolean' ? params.somentePendentes : null;

  const [unidadesMap, membrosMap, rows] = await Promise.all([
    getUnidadesMap(supabase, igrejaId),
    getMembrosMap(supabase, igrejaId),
    buscarTodos<any>(() => {
      let q = supabase
        .from('relatorios_semanais')
        .select(COLUNAS_RELATORIO)
        .eq('igreja_id', igrejaId)
        .order('data_relatorio', { ascending: false })
        .order('id', { ascending: true });
      if (inicio) q = q.gte('data_relatorio', inicio);
      if (fim) q = q.lt('data_relatorio', fim);
      if (somentePendentes === true) q = q.or(FILTRO_PENDENTE);
      else if (somentePendentes === false) q = q.eq('tesouraria_recebido', true);
      return q;
    }),
  ]);

  const setorFiltro = params.setorId && params.setorId !== 'todos' ? String(params.setorId).toLowerCase() : null;

  const lista: any[] = [];
  rows.forEach((item: any, idx: number) => {
    const { ano, mes } = anoMesDoItem(item.data_relatorio);
    // "Todos os anos" + mês específico: o mês é filtrado aqui (intervalo de datas não se aplica)
    if (todosAnos && pMes !== null && mes !== pMes) return;

    const l = converterItemParaLancamento(item, idx);
    const uInfo = item.unidade_id ? unidadesMap.get(String(item.unidade_id)) : null;
    const nomeCelula = uInfo?.nome || l.celulaNome || `Célula #${idx + 1}`;
    const setor = resolverSetor(uInfo, item.observacao);
    if (setorFiltro && setor.toLowerCase() !== setorFiltro) return;

    lista.push({
      id: String(item.id),
      unidade_id: item.unidade_id ? String(item.unidade_id) : undefined,
      celula_nome: String(nomeCelula),
      lideres: String((item.lancado_por && membrosMap.get(String(item.lancado_por))) || l.liderCelula || '-'),
      data_relatorio: String(item.data_relatorio || l.data),
      valor_pix: Number(item.valor_pix ?? 0),
      valor_especie: Number(item.valor_especie ?? 0),
      tesouraria_recebido: item.tesouraria_recebido === true,
      data_recebimento: item.data_recebimento || null,
      tesoureiro_id: item.tesoureiro_id || null,
      nome_tesoureiro: (item.tesoureiro_id && membrosMap.get(String(item.tesoureiro_id))) || l.NomeTesoureiro || null,
      setor,
      setor_nome: setor,
      ano,
      mes,
      numero_semana: item.numero_semana ?? l.semanaNumero,
    });
  });
  return lista;
}

function resumir(lista: any[], setoresBase: string[]) {
  let pendentes = 0;
  let confirmados = 0;
  const setores = new Map<string, number>();
  setoresBase.forEach((s) => setores.set(s, 0));
  lista.forEach((r) => {
    if (r.tesouraria_recebido) {
      confirmados++;
    } else {
      pendentes++;
      setores.set(r.setor, (setores.get(r.setor) || 0) + 1);
    }
  });
  return {
    resumo: { pendentes, confirmados },
    setores: Array.from(setores.entries()).map(([nome, qtd]) => ({ setor_id: nome, setor_nome: nome, qtd_pendentes: qtd })),
  };
}

type AgregadoDashboard = {
  ano: number;
  mes: number;
  setor: string;
  enviados: number;
  validados: number;
  pix_validado: number;
  especie_validado: number;
};

// Função SQL opcional (supabase/migrations/..._tesouraria_dashboard_resumo.sql).
// Se não estiver instalada, guarda isso por 10 min e soma no próprio servidor.
let rpcDashboardIndisponivelAte = 0;

async function resumoDashboard(supabase: SupabaseClient, igrejaId: string, ano: any): Promise<AgregadoDashboard[]> {
  const { todosAnos, pAno } = resolverPeriodo(ano, null);
  const anoParam = todosAnos ? null : pAno;

  if (Date.now() >= rpcDashboardIndisponivelAte) {
    const { data, error } = await supabase.rpc('tesouraria_dashboard_resumo', { p_igreja_id: igrejaId, p_ano: anoParam });
    if (!error) {
      return (data || []).map((r: any) => ({
        ano: Number(r.ano),
        mes: Number(r.mes),
        setor: String(r.setor || SEM_SETOR),
        enviados: Number(r.enviados) || 0,
        validados: Number(r.validados) || 0,
        pix_validado: Number(r.pix_validado) || 0,
        especie_validado: Number(r.especie_validado) || 0,
      }));
    }
    const funcaoAusente = error.code === 'PGRST202' || error.code === '42883';
    if (!funcaoAusente) throw new HttpError(400, error.message);
    rpcDashboardIndisponivelAte = Date.now() + 10 * 60 * 1000;
  }

  // Alternativa sem a função SQL: mesmos totais calculados aqui (em centavos)
  const relatorios = await carregarRelatorios(supabase, igrejaId, { ano: anoParam ?? 'todos' });
  const grupos = new Map<string, AgregadoDashboard & { pixCent: number; espCent: number }>();
  relatorios.forEach((r) => {
    const chave = `${r.ano}|${r.mes}|${r.setor}`;
    const g = grupos.get(chave) || {
      ano: r.ano, mes: r.mes, setor: r.setor, enviados: 0, validados: 0,
      pix_validado: 0, especie_validado: 0, pixCent: 0, espCent: 0,
    };
    g.enviados++;
    if (r.tesouraria_recebido) {
      g.validados++;
      g.pixCent += Math.round(r.valor_pix * 100);
      g.espCent += Math.round(r.valor_especie * 100);
    }
    grupos.set(chave, g);
  });
  return Array.from(grupos.values()).map(({ pixCent, espCent, ...g }) => ({
    ...g,
    pix_validado: pixCent / 100,
    especie_validado: espCent / 100,
  }));
}

// Função SQL opcional (supabase/migrations/..._tesouraria_inicio_unidades.sql).
let rpcInicioIndisponivelAte = 0;
const inicioCache = new CacheLimitado<Map<string, string>>(CACHE_MAX_IGREJAS, CACHE_TTL_MS);

/**
 * Data de início (YYYY-MM-DD) de cada unidade: a mais antiga entre a criação e o
 * primeiro relatório lançado (as unidades importadas têm criado_em = data da importação).
 */
async function inicioDasUnidades(
  supabase: SupabaseClient,
  igrejaId: string,
  unidades: { id: string; criado_em?: string | null }[]
): Promise<Map<string, string>> {
  const emCache = inicioCache.get(igrejaId);
  if (emCache) return emCache;

  const inicio = new Map<string, string>();
  let viaRpc = false;
  if (Date.now() >= rpcInicioIndisponivelAte) {
    const { data, error } = await supabase.rpc('tesouraria_inicio_unidades', { p_igreja_id: igrejaId });
    if (!error) {
      (data || []).forEach((r: any) => r.inicio && inicio.set(String(r.unidade_id), String(r.inicio).slice(0, 10)));
      viaRpc = true;
    } else if (error.code === 'PGRST202' || error.code === '42883') {
      rpcInicioIndisponivelAte = Date.now() + 10 * 60 * 1000;
    } else {
      throw new HttpError(400, error.message);
    }
  }

  if (!viaRpc) {
    // Alternativa sem a função SQL: primeiro relatório de cada unidade + data de criação
    const relatorios = await buscarTodos<{ unidade_id: string | null; data_relatorio: string | null }>(() =>
      supabase
        .from('relatorios_semanais')
        .select('unidade_id, data_relatorio')
        .eq('igreja_id', igrejaId)
        .not('unidade_id', 'is', null)
        .order('id')
    );
    relatorios.forEach((r) => {
      if (!r.unidade_id || !r.data_relatorio) return;
      const data = String(r.data_relatorio).slice(0, 10);
      const atual = inicio.get(String(r.unidade_id));
      if (!atual || data < atual) inicio.set(String(r.unidade_id), data);
    });
    unidades.forEach((u) => {
      const criado = u.criado_em ? String(u.criado_em).slice(0, 10) : null;
      const atual = inicio.get(String(u.id));
      if (criado && (!atual || criado < atual)) inicio.set(String(u.id), criado);
    });
  }

  inicioCache.set(igrejaId, inicio);
  return inicio;
}

function validarId(id: any): string {
  const s = String(id || '').trim();
  if (!UUID_RE.test(s)) throw new HttpError(400, 'Identificador de relatório inválido.');
  return s;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, params = {} } = body || {};
    const supabase = getAdminClient();
    const membro = await autenticar(req, supabase);
    verificarLimite(membro.id);
    const igrejaId = membro.igreja_id;

    switch (action) {
      // Dados da sessão para a interface (ex.: mostrar ou não a tela de Permissões)
      case 'minha_sessao': {
        // Primeiro ano com relatórios (usa o índice igreja_id + data_relatorio)
        const { data: primeiro } = await supabase
          .from('relatorios_semanais')
          .select('data_relatorio')
          .eq('igreja_id', igrejaId)
          .not('data_relatorio', 'is', null)
          .order('data_relatorio', { ascending: true })
          .limit(1)
          .maybeSingle();
        const primeiroAno = primeiro?.data_relatorio ? Number(String(primeiro.data_relatorio).slice(0, 4)) : null;
        return NextResponse.json({
          success: true,
          data: {
            id: membro.id,
            nome: membro.nome,
            igreja_id: igrejaId,
            podeGerenciarPermissoes: membro.podeGerenciarPermissoes,
            primeiroAno,
          },
        });
      }

      // Tudo que a tela "Validar Relatórios" precisa, em UMA consulta por período
      case 'painel_validacao': {
        const [relatorios, unidades] = await Promise.all([
          carregarRelatorios(supabase, igrejaId, { ano: params.ano, mes: params.mes }),
          getUnidadesMap(supabase, igrejaId),
        ]);
        const { resumo, setores } = resumir(relatorios, setoresDaIgreja(unidades));
        return NextResponse.json({ success: true, data: { resumo, setores, relatorios } });
      }

      // Totais por (ano, mês, setor) para o Dashboard: ~100 linhas por ano em vez de milhares
      case 'dashboard_resumo': {
        const data = await resumoDashboard(supabase, igrejaId, params.ano);
        return NextResponse.json({ success: true, data });
      }

      case 'listar_unidades': {
        // Sempre a igreja da sessão: nunca aceitar igreja_id vindo do navegador
        const [rows, lideresPorUnidade] = await Promise.all([
          buscarTodos<any>(() =>
            supabase
              .from('unidades')
              .select('id, nome, pai_id, ativo, nivel_tipo_id, igreja_id, dia_semana, criado_em')
              .eq('igreja_id', igrejaId)
              .order('nome', { ascending: true })
              .order('id', { ascending: true })
          ),
          carregarLideresPorUnidade(supabase, igrejaId),
        ]);

        // Nível "célula" de cada igreja = o nivel_tipo de maior ordem (sem id fixo no código)
        const { data: niveis } = await supabase.from('nivel_tipo').select('id, ordem').eq('igreja_id', igrejaId);
        const nivelCelula = (niveis || []).reduce<{ id: string; ordem: number } | null>(
          (maior, n: any) => (!maior || Number(n.ordem) > maior.ordem ? { id: String(n.id), ordem: Number(n.ordem) } : maior),
          null
        );

        // Início de cada célula: o Dashboard não prevê relatórios antes dele
        const inicio = await inicioDasUnidades(supabase, igrejaId, rows);

        const data = rows.map((u: any) => {
          const lids = lideresPorUnidade.get(String(u.id)) || [];
          return {
            ...u,
            inicio_em: inicio.get(String(u.id)) || (u.criado_em ? String(u.criado_em).slice(0, 10) : null),
            eh_celula: nivelCelula && u.nivel_tipo_id ? String(u.nivel_tipo_id) === nivelCelula.id : null,
            lideres: lids,
            lider_nome: lids.join(', ') || null,
          };
        });

        return NextResponse.json({ success: true, data });
      }

      case 'listar_permissoes': {
        exigirAdmin(membro);
        const { data: permissoes, error: permError } = await supabase
          .from('tesouraria_permissao')
          .select('*')
          .eq('igreja_id', igrejaId)
          .order('id', { ascending: true });

        if (permError) throw new HttpError(400, permError.message);

        const membroIds = (permissoes || []).map((p: any) => p.membro_id).filter(Boolean);

        const membrosMap = new Map<string, { id: string; nome: string; funcao?: string; email?: string }>();
        if (membroIds.length > 0) {
          const { data: membrosList } = await supabase
            .from('membros')
            .select('id, nome, funcao, email')
            .in('id', membroIds);

          (membrosList || []).forEach((m: any) => {
            membrosMap.set(String(m.id), m);
          });
        }

        const data = (permissoes || []).map((p: any) => {
          const m = membrosMap.get(String(p.membro_id));
          return {
            id: String(p.id),
            membro_id: String(p.membro_id),
            nome: m?.nome || 'Membro da Igreja',
            funcao: m?.funcao || 'Membro',
            email: m?.email || '',
            criado_em: p.criado_em || p.created_at || null,
          };
        });

        return NextResponse.json({ success: true, data });
      }

      case 'buscar_membros': {
        exigirAdmin(membro);
        const busca = String(params.busca || '').trim();
        let q = supabase
          .from('membros')
          .select('id, nome, funcao, email')
          .eq('igreja_id', igrejaId)
          .order('nome', { ascending: true })
          .limit(40);

        if (busca) {
          // Escapa curingas do LIKE: "%" e "_" digitados são buscados literalmente
          q = q.ilike('nome', `%${busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
        }

        const { data, error } = await q;
        if (error) throw new HttpError(400, error.message);
        return NextResponse.json({ success: true, data: data || [] });
      }

      case 'adicionar_permissao': {
        exigirAdmin(membro);
        const membroId = String(params.membro_id || '').trim();
        if (!UUID_RE.test(membroId)) throw new HttpError(400, 'membro_id inválido.');

        // Só membros ativos da própria igreja podem receber acesso
        const { data: alvo } = await supabase
          .from('membros')
          .select('id')
          .eq('id', membroId)
          .eq('igreja_id', igrejaId)
          .maybeSingle();
        if (!alvo) throw new HttpError(404, 'Membro não encontrado nesta igreja.');

        const { data: existente } = await supabase
          .from('tesouraria_permissao')
          .select('id')
          .eq('membro_id', membroId)
          .eq('igreja_id', igrejaId)
          .maybeSingle();

        if (existente) {
          return NextResponse.json({ success: true, data: existente, message: 'Usuário já possui permissão.' });
        }

        const { data, error } = await supabase
          .from('tesouraria_permissao')
          .insert({
            membro_id: membroId,
            igreja_id: igrejaId,
          })
          .select('*')
          .single();

        if (error) throw new HttpError(400, error.message);
        return NextResponse.json({ success: true, data });
      }

      case 'remover_permissao': {
        const id = params.id ? String(params.id).trim() : null;
        const membroId = params.membro_id ? String(params.membro_id).trim() : null;

        exigirAdmin(membro);
        if (!id && !membroId) throw new HttpError(400, 'ID ou membro_id é obrigatório para remover permissão.');
        if (membroId === membro.id) {
          throw new HttpError(400, 'Você não pode remover o seu próprio acesso.');
        }

        let q = supabase.from('tesouraria_permissao').delete().eq('igreja_id', igrejaId);
        if (id) {
          q = q.eq('id', id);
        } else if (membroId) {
          q = q.eq('membro_id', membroId);
        }

        // Não permite remover o próprio acesso pelo id da linha
        q = q.neq('membro_id', membro.id);

        const { data: removidos, error } = await q.select('membro_id');
        if (error) throw new HttpError(400, error.message);
        if (!removidos?.length) throw new HttpError(404, 'Permissão não encontrada (ou é o seu próprio acesso).');
        // Quem perdeu o acesso não continua entrando pelo cache de sessão
        removidos.forEach((r: any) => invalidarSessoesDoMembro(String(r.membro_id)));
        return NextResponse.json({ success: true });
      }

      case 'relatorios_detalhados': {
        const data = await carregarRelatorios(supabase, igrejaId, params);
        return NextResponse.json({ success: true, data });
      }

      case 'confirmar_individual':
      case 'desconfirmar_individual': {
        const id = validarId(params.id);
        const nowIso = new Date().toISOString();
        const confirmar = action === 'confirmar_individual';
        let q = supabase
          .from('relatorios_semanais')
          .update({
            tesouraria_recebido: confirmar,
            data_recebimento: confirmar ? nowIso : null,
            tesoureiro_id: confirmar ? membro.id : null,
            atualizado_em: nowIso,
          })
          .eq('id', id)
          .eq('igreja_id', igrejaId);
        // Só muda quem ainda está no estado oposto: dois tesoureiros validando ao mesmo
        // tempo não sobrescrevem quem validou primeiro (nem a data do recebimento)
        q = confirmar ? q.or(FILTRO_PENDENTE) : q.eq('tesouraria_recebido', true);
        const { data, error } = await q.select('id');
        if (error) throw new HttpError(400, error.message);
        if (!data?.length) {
          const { data: existe } = await supabase
            .from('relatorios_semanais')
            .select('id')
            .eq('id', id)
            .eq('igreja_id', igrejaId)
            .maybeSingle();
          if (!existe) throw new HttpError(404, 'Relatório não encontrado nesta igreja.');
          // Já estava no estado pedido (outra pessoa fez antes): nada a alterar
          return NextResponse.json({
            success: true,
            message: confirmar ? 'Este relatório já havia sido validado.' : 'Este relatório já estava pendente.',
          });
        }
        return NextResponse.json({ success: true });
      }

      case 'confirmar_massa': {
        const ids: string[] = Array.isArray(params.ids) ? params.ids.map(validarId) : [];
        if (ids.length === 0) return NextResponse.json({ success: true, count: 0 });
        if (ids.length > 1000) throw new HttpError(400, 'Selecione no máximo 1000 relatórios por vez.');
        const nowIso = new Date().toISOString();
        // Em lotes: 1000 ids numa só URL passariam do limite de tamanho da requisição
        let count = 0;
        for (let i = 0; i < ids.length; i += 150) {
          const { data, error } = await supabase
            .from('relatorios_semanais')
            .update({
              tesouraria_recebido: true,
              data_recebimento: nowIso,
              tesoureiro_id: membro.id,
              atualizado_em: nowIso,
            })
            .in('id', ids.slice(i, i + 150))
            .eq('igreja_id', igrejaId)
            .or(FILTRO_PENDENTE) // não sobrescreve quem já validou
            .select('id');
          if (error) throw new HttpError(400, error.message);
          count += data?.length || 0;
        }
        return NextResponse.json({ success: true, count });
      }

      case 'atualizar_valores': {
        const id = validarId(params.id);
        const valorPix = Number(params.valorPix ?? 0);
        const valorEspecie = Number(params.valorEspecie ?? 0);
        if (!Number.isFinite(valorPix) || !Number.isFinite(valorEspecie) || valorPix < 0 || valorEspecie < 0) {
          throw new HttpError(400, 'Valores inválidos.');
        }
        const { data, error } = await supabase
          .from('relatorios_semanais')
          .update({ valor_pix: valorPix, valor_especie: valorEspecie, atualizado_em: new Date().toISOString() })
          .eq('id', id)
          .eq('igreja_id', igrejaId)
          .select('id');
        if (error) throw new HttpError(400, error.message);
        if (!data?.length) throw new HttpError(404, 'Relatório não encontrado nesta igreja.');
        return NextResponse.json({ success: true });
      }

      case 'excluir': {
        const id = validarId(params.id);
        const { data, error } = await supabase
          .from('relatorios_semanais')
          .delete()
          .eq('id', id)
          .eq('igreja_id', igrejaId)
          .select('id');
        if (error) throw new HttpError(400, error.message);
        if (!data?.length) throw new HttpError(404, 'Relatório não encontrado nesta igreja.');
        return NextResponse.json({ success: true });
      }

      default:
        throw new HttpError(400, 'Ação não reconhecida.');
    }
  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error('[API /api/treasury] Erro:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Erro interno no servidor.', authError: status === 401 || status === 403 },
      { status }
    );
  }
}
