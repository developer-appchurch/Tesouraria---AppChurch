import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://srjkwwddbxniqhzqvrhc.supabase.co';
const DEFAULT_SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyamt3d2RkYnhuaXFoenF2cmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDI4MjgsImV4cCI6MjEwNTU3ODgyOH0.9uvatfClKVxyzBrBC7zGL9ujSaVYtyxf74q6i1YVOjs';

function isValidHttpUrl(str?: string): boolean {
  if (!str) return false;
  const s = str.trim();
  return s.startsWith('https://') || s.startsWith('http://');
}

/**
 * Retorna as credenciais resolvidas do Supabase.
 * IMPORTANTE: No browser (typeof window !== 'undefined'), NUNCA fornece uma chave secreta (sb_secret_...),
 * pois o SDK do Supabase gera ativamente a exceção "Forbidden use of secret API key in browser".
 */
export function getResolvedSupabaseCredentials(): { url: string; key: string } {
  const isServer = typeof window === 'undefined';
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const envKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  let finalUrl = DEFAULT_SUPABASE_URL;
  let finalKey = DEFAULT_SUPABASE_KEY;

  // 1. Garante que a URL seja um endereço HTTP/HTTPS válido
  if (isValidHttpUrl(envUrl)) {
    finalUrl = envUrl!;
  } else if (isValidHttpUrl(envKey)) {
    finalUrl = envKey!;
  }

  // 2. Determina a chave apropriada
  if (isServer) {
    // No servidor Node.js: pode usar a chave de serviço (sb_secret_...) com segurança
    if (envKey && !isValidHttpUrl(envKey)) {
      finalKey = envKey;
    } else if (envUrl && !isValidHttpUrl(envUrl)) {
      finalKey = envUrl;
    }
  } else {
    // No BROWSER: apenas chaves públicas (publishable ou anon JWT) são permitidas.
    // Chaves com prefixo "sb_secret_" são terminantemente proibidas no browser pelo Supabase.
    if (envKey && envKey.startsWith('sb_publishable_')) {
      finalKey = envKey;
    } else if (envUrl && envUrl.startsWith('sb_publishable_')) {
      finalKey = envUrl;
    } else if (envKey && !envKey.startsWith('sb_secret_') && !isValidHttpUrl(envKey)) {
      finalKey = envKey;
    } else {
      finalKey = DEFAULT_SUPABASE_KEY;
    }
  }

  return { url: finalUrl, key: finalKey };
}

const { url: resolvedUrl, key: resolvedKey } = getResolvedSupabaseCredentials();

export const SUPABASE_URL = resolvedUrl;
export const SUPABASE_ANON_KEY = resolvedKey;

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const { url, key } = getResolvedSupabaseCredentials();

  supabaseInstance = createClient(url, key, {
    auth: {
      persistSession: typeof window !== 'undefined',
      autoRefreshToken: typeof window !== 'undefined',
    },
  });

  return supabaseInstance;
}

/**
 * Cria um cliente Supabase exclusivo para uso no servidor com a chave de serviço (sb_secret_...)
 */
export function getServerSupabaseClient(): SupabaseClient {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const envKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();

  let url = DEFAULT_SUPABASE_URL;
  if (isValidHttpUrl(envUrl)) {
    url = envUrl!;
  }

  let key = DEFAULT_SUPABASE_KEY;
  if (envKey && !isValidHttpUrl(envKey)) {
    key = envKey;
  } else if (envUrl && !isValidHttpUrl(envUrl)) {
    key = envUrl;
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
