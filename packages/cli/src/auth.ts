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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderCallbackHtml(status: number, title: string, body: string) {
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body);
  const isSuccess = status >= 200 && status < 300;
  const statusText = isSuccess ? "Authentication complete" : "Action needed";
  const iconPath = isSuccess
    ? '<path d="m6.9 12.6 3.4 3.3 7-7.4" />'
    : '<path d="M12 7.2v5.1" /><path d="M12 16.8h.01" />';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #000000;
      --text: #ffffff;
      --muted: rgba(255, 255, 255, 0.62);
      --faint: rgba(255, 255, 255, 0.42);
      --panel: rgba(255, 255, 255, 0.04);
      --panel-border: rgba(255, 255, 255, 0.10);
      --success: #22c55e;
      --danger: #fb7185;
    }

    * {
      box-sizing: border-box;
    }

    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      overflow-x: hidden;
      background:
        radial-gradient(ellipse 80% 60% at 50% 0%, rgba(120, 180, 255, 0.25), transparent 70%),
        var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-rendering: geometricPrecision;
    }

    main {
      width: min(440px, calc(100vw - 40px));
      padding: 28px;
      border: 1px solid var(--panel-border);
      border-radius: 14px;
      background: var(--panel);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(18px);
    }

    .brand {
      margin-bottom: 28px;
      color: var(--text);
      font-size: 15px;
      font-weight: 700;
      line-height: 1;
    }

    .status-icon {
      width: 38px;
      height: 38px;
      margin-bottom: 18px;
      display: grid;
      place-items: center;
      color: var(--tone);
    }

    .success {
      --tone: var(--success);
    }

    .error {
      --tone: var(--danger);
    }

    svg {
      width: 38px;
      height: 38px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.35;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .eyebrow {
      margin: 0 0 8px;
      color: var(--faint);
      font-size: 12px;
      font-weight: 650;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      color: var(--text);
      font-size: 30px;
      line-height: 1.12;
      font-weight: 720;
      letter-spacing: 0;
    }

    .message {
      max-width: 32rem;
      margin: 12px 0 0;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.55;
    }
  </style>
</head>
<body class="${isSuccess ? "success" : "error"}">
  <main aria-live="polite">
    <div class="brand">Neptune</div>
    <div class="status-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">${iconPath}</svg>
    </div>
    <p class="eyebrow">${statusText}</p>
    <h1>${safeTitle}</h1>
    <p class="message">${safeBody}</p>
  </main>
</body>
</html>`;
}

function sendHtml(response: ServerResponse, status: number, title: string, body: string) {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  response.end(renderCallbackHtml(status, title, body));
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

      sendHtml(response, 200, "Signed in", "Return to your terminal to continue.");
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
