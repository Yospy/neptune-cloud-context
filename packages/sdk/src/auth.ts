import { createClient, type Session } from "@supabase/supabase-js";
import type { StoredAuth } from "./config.js";

export function sessionToStoredAuth(session: Session): StoredAuth {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000 + session.expires_in),
    tokenType: session.token_type,
    user: {
      id: session.user.id,
      ...(session.user.email ? { email: session.user.email } : {})
    }
  };
}

export function shouldRefreshAuth(auth: StoredAuth, nowSeconds = Math.floor(Date.now() / 1000)) {
  return auth.expiresAt <= nowSeconds + 60;
}

export async function refreshStoredAuth(options: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  auth: StoredAuth;
}): Promise<StoredAuth> {
  const supabase = createClient(options.supabaseUrl, options.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: options.auth.refreshToken
  });

  if (error || !data.session) {
    throw new Error(`Failed to refresh login session: ${error?.message ?? "missing session"}`);
  }

  return sessionToStoredAuth(data.session);
}
