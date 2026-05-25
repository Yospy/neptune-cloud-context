import { createServer, type ServerResponse } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { sessionToStoredAuth, type StoredAuth } from "neptune-context";
import { openBrowser } from "./browser.js";

type LoginOptions = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  timeoutMs?: number;
  openUrl?: (url: string) => Promise<boolean>;
  stdout?: Pick<NodeJS.WriteStream, "write">;
};

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function createMemoryStorage(): MemoryStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    }
  };
}

function sendHtml(response: ServerResponse, status: number, title: string, body: string) {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f7f7f4; color: #181816; }
    main { width: min(520px, calc(100vw - 32px)); border: 1px solid #d8d6cf; background: #fff; border-radius: 8px; padding: 28px; box-shadow: 0 18px 50px rgba(0,0,0,.08); }
    h1 { font-size: 22px; margin: 0 0 10px; }
    p { line-height: 1.5; margin: 0; color: #4d4a43; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${body}</p>
  </main>
</body>
</html>`);
}

export function addApiKeyToOAuthUrl(url: string, supabaseAnonKey: string) {
  const parsed = new URL(url);
  if (!parsed.searchParams.has("apikey")) {
    parsed.searchParams.set("apikey", supabaseAnonKey);
  }
  return parsed.toString();
}

export async function loginWithGitHub(options: LoginOptions): Promise<StoredAuth> {
  const storage = createMemoryStorage();
  const supabase = createClient(options.supabaseUrl, options.supabaseAnonKey, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage
    }
  });

  const server = createServer();
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const stdout = options.stdout ?? process.stdout;

  try {
    return await new Promise<StoredAuth>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Login timed out before the OAuth callback completed."));
    }, timeoutMs);

    server.on("request", async (request, response) => {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

      if (url.pathname !== "/auth/callback") {
        sendHtml(response, 404, "Not found", "This local Neptune login callback was not found.");
        return;
      }

      const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
      if (oauthError) {
        sendHtml(response, 400, "Neptune login failed", oauthError);
        clearTimeout(timer);
        reject(new Error(`OAuth login failed: ${oauthError}`));
        return;
      }

      const code = url.searchParams.get("code");
      if (!code) {
        sendHtml(response, 400, "Neptune login failed", "The OAuth callback did not include a code.");
        clearTimeout(timer);
        reject(new Error("OAuth callback did not include a code."));
        return;
      }

      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.session) {
        sendHtml(response, 400, "Neptune login failed", "The OAuth code could not be exchanged.");
        clearTimeout(timer);
        reject(new Error(`Failed to exchange OAuth code: ${error?.message ?? "missing session"}`));
        return;
      }

      sendHtml(response, 200, "Neptune login complete", "You can close this tab and return to your terminal.");
      clearTimeout(timer);
      resolve(sessionToStoredAuth(data.session));
    });

    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        clearTimeout(timer);
        reject(new Error("Failed to start local login callback server."));
        return;
      }

      const redirectTo = `http://127.0.0.1:${address.port}/auth/callback`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo
        }
      });

      if (error || !data.url) {
        clearTimeout(timer);
        reject(new Error(`Failed to start GitHub login: ${error?.message ?? "missing login URL"}`));
        return;
      }

      const loginUrl = addApiKeyToOAuthUrl(data.url, options.supabaseAnonKey);
      const opened = await (options.openUrl ?? openBrowser)(loginUrl);
      if (!opened) {
        stdout.write(`Open this URL to log in:\n${loginUrl}\n`);
      }
    });
    });
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}
