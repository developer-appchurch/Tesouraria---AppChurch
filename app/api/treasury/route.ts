import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { converterItemParaLancamento, MAPA_CELULAS_SETORES } from '@/lib/treasury-service';

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

const SETORES_PADRAO = ['Safira', 'Fire', 'White', 'Black', 'Azul', 'Amarelo', 'Legacy', 'Onix', 'Diamante', 'Titanium'];
const PAGE_SIZE = 1000;
const MAX_ROWS = 20000;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos de cache em memória para unidades e membros
const AUTH_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos de cache para sessão e permissão
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUNAS_RELATORIO =
  'id, unidade_id, lancado_por, data_relatorio, numero_semana, valor_pix, valor_especie, observacao, data_recebimento, tesoureiro_id, tesouraria_recebido, criado_em';

type Unidade = { id: string; nome: string; pai_id?: string | null; setor_nome?: string };
type Membro = { id: string; nome: string; igreja_id: string };

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

const authCache = new Map<string, { membro: Membro; at: number }>();

async function autenticar(req: NextRequest, supabase: SupabaseClient): Promise<Membro> {
  const header = req.headers.get('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Sessão ausente. Faça login novamente.');

  const now = Date.now();
  const cached = authCache.get(token);
  if (cached && now - cached.at < AUTH_CACHE_TTL_MS) return cached.membro;

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) throw new HttpError(401, 'Sessão expirada. Faça login novamente.');

  const { data: membro } = await supabase
    .from('membros')
    .select('id, nome, igreja_id, acesso_ativo')
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

  const result: Membro = { id: String(membro.id), nome: String(membro.nome || ''), igreja_id: String(membro.igreja_id) };
  if (authCache.size > 500) authCache.clear();
  authCache.set(token, { membro: result, at: now });
  return result;
}

// ---------------------------------------------------------------------------
// Utilitários de consulta
// ---------------------------------------------------------------------------

/** Busca todas as linhas de uma consulta, página por página (limite do Supabase: 1000 por vez). */
async function buscarTodos<T = any>(montarConsulta: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await montarConsulta().range(from, from + PAGE_SIZE - 1);
    if (error) throw new HttpError(400, error.message);
    const rows = (data || []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

const unidadesCache = new Map<string, { map: Map<string, Unidade>; at: number }>();
const membrosCache = new Map<string, { map: Map<string, string>; at: number }>();

async function getUnidadesMap(supabase: SupabaseClient, igrejaId: string) {
  const c = unidadesCache.get(igrejaId);
  if (c && Date.now() - c.at < CACHE_TTL_MS) return c.map;
  const rows = await buscarTodos<Unidade>(() =>
    supabase.from('unidades').select('id, nome, pai_id').eq('igreja_id', igrejaId).order('id')
  );
  const map = new Map<string, Unidade>();
  rows.forEach((u) => map.set(String(u.id), { ...u }));
  map.forEach((u) => {
    if (u.pai_id && map.has(String(u.pai_id))) u.setor_nome = map.get(String(u.pai_id))?.nome;
  });
  unidadesCache.set(igrejaId, { map, at: Date.now() });
  return map;
}

async function getMembrosMap(supabase: SupabaseClient, igrejaId: string) {
  const c = membrosCache.get(igrejaId);
  if (c && Date.now() - c.at < CACHE_TTL_MS) return c.map;
  const rows = await buscarTodos<{ id: string; nome: string }>(() =>
    supabase.from('membros').select('id, nome').eq('igreja_id', igrejaId).order('id')
  );
  const map = new Map<string, string>();
  rows.forEach((m) => map.set(String(m.id), String(m.nome)));
  membrosCache.set(igrejaId, { map, at: Date.now() });
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

function resolverSetor(u: Unidade | null | undefined, nomeCelula: string, observacao: any) {
  let setor = u?.setor_nome;
  if (!setor || setor === 'Safira') {
    const cNorm = String(nomeCelula || '').toLowerCase().trim();
    if (MAPA_CELULAS_SETORES[cNorm]) {
      setor = MAPA_CELULAS_SETORES[cNorm];
    } else {
      const obs = String(observacao || '');
      if (obs.toLowerCase().includes('setor:')) {
        const match = obs.match(/setor:\s*([^|]+)/i);
        if (match) setor = match[1].trim();
      }
    }
  }
  return setor || 'Safira';
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
      if (somentePendentes === true) q = q.or('tesouraria_recebido.eq.false,tesouraria_recebido.is.null');
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
    const setor = resolverSetor(uInfo, nomeCelula, item.observacao);
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

function resumir(lista: any[]) {
  let pendentes = 0;
  let confirmados = 0;
  const setores = new Map<string, number>();
  SETORES_PADRAO.forEach((s) => setores.set(s, 0));
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
    const igrejaId = membro.igreja_id;

    switch (action) {
      // Tudo que a tela "Validar Relatórios" precisa, em UMA consulta por período
      case 'painel_validacao': {
        const relatorios = await carregarRelatorios(supabase, igrejaId, { ano: params.ano, mes: params.mes });
        const { resumo, setores } = resumir(relatorios);
        return NextResponse.json({ success: true, data: { resumo, setores, relatorios } });
      }

      case 'listar_unidades': {
        const rows = await buscarTodos<any>(() =>
          supabase
            .from('unidades')
            .select('id, nome, pai_id, ativo')
            .eq('igreja_id', igrejaId)
            .order('nome', { ascending: true })
        );
        return NextResponse.json({ success: true, data: rows });
      }

      case 'listar_permissoes': {
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
        const busca = String(params.busca || '').trim();
        let q = supabase
          .from('membros')
          .select('id, nome, funcao, email')
          .eq('igreja_id', igrejaId)
          .order('nome', { ascending: true })
          .limit(40);

        if (busca) {
          q = q.ilike('nome', `%${busca}%`);
        }

        const { data, error } = await q;
        if (error) throw new HttpError(400, error.message);
        return NextResponse.json({ success: true, data: data || [] });
      }

      case 'adicionar_permissao': {
        const membroId = String(params.membro_id || '').trim();
        if (!membroId) throw new HttpError(400, 'membro_id é obrigatório.');

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

        if (!id && !membroId) throw new HttpError(400, 'ID ou membro_id é obrigatório para remover permissão.');

        let q = supabase.from('tesouraria_permissao').delete().eq('igreja_id', igrejaId);
        if (id) {
          q = q.eq('id', id);
        } else if (membroId) {
          q = q.eq('membro_id', membroId);
        }

        const { error } = await q;
        if (error) throw new HttpError(400, error.message);
        return NextResponse.json({ success: true });
      }

      case 'relatorios_detalhados': {
        const data = await carregarRelatorios(supabase, igrejaId, params);
        return NextResponse.json({ success: true, data });
      }

      case 'resumo': {
        const { resumo } = resumir(await carregarRelatorios(supabase, igrejaId, { ano: params.ano, mes: params.mes }));
        return NextResponse.json({ success: true, data: resumo });
      }

      case 'setores_pendencias': {
        const { setores } = resumir(
          await carregarRelatorios(supabase, igrejaId, { ano: params.ano, mes: params.mes, somentePendentes: true })
        );
        return NextResponse.json({ success: true, data: setores });
      }

      case 'confirmar_individual':
      case 'desconfirmar_individual': {
        const id = validarId(params.id);
        const nowIso = new Date().toISOString();
        const confirmar = action === 'confirmar_individual';
        const { data, error } = await supabase
          .from('relatorios_semanais')
          .update({
            tesouraria_recebido: confirmar,
            data_recebimento: confirmar ? nowIso : null,
            tesoureiro_id: confirmar ? membro.id : null,
            atualizado_em: nowIso,
          })
          .eq('id', id)
          .eq('igreja_id', igrejaId)
          .select('id');
        if (error) throw new HttpError(400, error.message);
        if (!data?.length) throw new HttpError(404, 'Relatório não encontrado nesta igreja.');
        return NextResponse.json({ success: true });
      }

      case 'confirmar_massa': {
        const ids: string[] = Array.isArray(params.ids) ? params.ids.map(validarId) : [];
        if (ids.length === 0) return NextResponse.json({ success: true, count: 0 });
        if (ids.length > 1000) throw new HttpError(400, 'Selecione no máximo 1000 relatórios por vez.');
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
          .from('relatorios_semanais')
          .update({
            tesouraria_recebido: true,
            data_recebimento: nowIso,
            tesoureiro_id: membro.id,
            atualizado_em: nowIso,
          })
          .in('id', ids)
          .eq('igreja_id', igrejaId)
          .select('id');
        if (error) throw new HttpError(400, error.message);
        return NextResponse.json({ success: true, count: data?.length || 0 });
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
