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
 * Credenciais PÚBLICAS do Supabase (URL + chave anon/publishable).
 * Este cliente é usado no navegador: nunca aceita chave secreta (sb_secret_ / service_role).
 * O acesso aos dados passa pela rota /api/treasury; o RLS do banco protege o resto.
 */
export function getResolvedSupabaseCredentials(): { url: string; key: string } {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();

  const url = isValidHttpUrl(envUrl) ? envUrl! : DEFAULT_SUPABASE_URL;
  const chavePublica = envKey && !envKey.startsWith('sb_secret_') && !isValidHttpUrl(envKey) && !ehServiceRole(envKey);
  return { url, key: chavePublica ? envKey! : DEFAULT_SUPABASE_KEY };
}

/** JWT legado com role "service_role" (chave secreta). */
function ehServiceRole(chave: string): boolean {
  const partes = chave.split('.');
  if (partes.length !== 3) return false;
  try {
    return JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role';
  } catch {
    return false;
  }
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
