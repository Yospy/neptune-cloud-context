import type { NeptuneConfig } from "./config.js";

export const DEFAULT_API_URL = "http://127.0.0.1:8787";

export type NeptuneEnv = {
  apiUrl: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

export function resolveNeptuneEnv(
  source: NodeJS.ProcessEnv = process.env,
  stored: NeptuneConfig = {}
): NeptuneEnv {
  return {
    apiUrl: source.NEPTUNE_API_URL ?? source.AGENTCTX_API_URL ?? stored.apiUrl ?? DEFAULT_API_URL,
    supabaseUrl:
      source.NEPTUNE_SUPABASE_URL ??
      source.AGENTCTX_SUPABASE_URL ??
      source.NEXT_PUBLIC_SUPABASE_URL ??
      stored.supabaseUrl,
    supabaseAnonKey:
      source.NEPTUNE_SUPABASE_ANON_KEY ??
      source.AGENTCTX_SUPABASE_ANON_KEY ??
      source.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      stored.supabaseAnonKey
  };
}

export const resolveCliEnv = resolveNeptuneEnv;

export function requireSupabasePublicConfig(env: NeptuneEnv) {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(
      "Missing Supabase public config. Set NEPTUNE_SUPABASE_URL and NEPTUNE_SUPABASE_ANON_KEY, or NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return {
    supabaseUrl: env.supabaseUrl,
    supabaseAnonKey: env.supabaseAnonKey
  };
}
