import { createClient } from "@supabase/supabase-js";
import type { BackendEnv } from "./types.js";

const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
};

export function createSupabaseAuthClient(env: BackendEnv) {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, clientOptions);
}

export function createSupabaseAdminClient(env: BackendEnv) {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, clientOptions);
}
