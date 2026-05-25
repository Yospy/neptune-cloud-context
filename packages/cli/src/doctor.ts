import { execFile as nodeExecFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { getMe, loadConfig, loadProjectBinding, resolveNeptuneEnv, type FetchLike } from "neptune-context";
import { defaultCodexConfigPath, type ExecFileLike, type McpInstallTarget } from "./mcp-install.js";

type WritableStream = Pick<NodeJS.WriteStream, "write">;

export type DoctorDeps = {
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: FetchLike;
  stdout?: WritableStream;
  codexConfigPath?: string;
  execFile?: ExecFileLike;
  cwd?: string;
  nodeVersion?: string;
  mcpProbe?: (apiUrl: string) => Promise<void>;
};

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

const execFileAsync = promisify(nodeExecFile) as ExecFileLike;

function writeLine(stream: WritableStream, value = "") {
  stream.write(`${value}\n`);
}

function flagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function isTarget(value: string): value is McpInstallTarget {
  return ["codex", "claude", "all"].includes(value);
}

async function captureCheck(name: string, check: () => Promise<string> | string): Promise<Check> {
  try {
    return { name, ok: true, detail: await check() };
  } catch (error) {
    return { name, ok: false, detail: (error as Error).message };
  }
}

function assertNodeVersion(version: string) {
  const major = Number.parseInt(version.replace(/^v/, "").split(".")[0] ?? "0", 10);
  if (major < 20) {
    throw new Error(`Node.js >=20 required, found ${version}.`);
  }
  return version;
}

async function fetchHealth(apiUrl: string, fetchLike: FetchLike = fetch) {
  const response = await fetchLike(new URL("/health", apiUrl).toString());
  if (!response.ok) {
    throw new Error(`Health check failed with HTTP ${response.status}.`);
  }
  return `healthy at ${apiUrl}`;
}

async function checkCodexConfig(codexConfigPath?: string) {
  const path = codexConfigPath ?? defaultCodexConfigPath();
  const value = await readFile(path, "utf8");
  if (!value.includes("[mcp_servers.neptune]") || !value.includes("neptune-context-mcp")) {
    throw new Error(`Neptune MCP server is missing from ${path}.`);
  }
  return path;
}

async function checkClaudeConfig(execFile: ExecFileLike) {
  let result: { stdout: string; stderr: string };
  try {
    result = await execFile("claude", ["mcp", "list"]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("Claude Code CLI not found.");
    }
    throw error;
  }
  if (!result.stdout.includes("neptune") && !result.stderr.includes("neptune")) {
    throw new Error("Neptune MCP server is missing from Claude Code config.");
  }
  return "neptune";
}

function defaultMcpProbe(apiUrl: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("npx", ["-y", "neptune-context-mcp"], {
      env: { ...process.env, NEPTUNE_API_URL: apiUrl },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      finish(new Error("MCP probe timed out."));
    }, 5000);

    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill();
      if (error) reject(error);
      else resolve();
    }

    child.on("error", (error) => finish(error));
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line) as { id?: number; result?: { tools?: Array<{ name?: string }> } };
          if (message.id === 2) {
            const names = message.result?.tools?.map((tool) => tool.name) ?? [];
            if (!names.includes("require_project_binding")) {
              finish(new Error("MCP probe did not expose Neptune tools."));
              return;
            }
            finish();
          }
        } catch {
          // Wait for a complete JSON-RPC line.
        }
      }
    });
    child.on("exit", (code) => {
      if (!settled) finish(new Error(`MCP probe exited with code ${code}. ${stderr}`.trim()));
    });

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "neptune-doctor", version: "0.1.0" }
        }
      })}\n`
    );
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
  });
}

export async function runDoctor(args: string[], deps: DoctorDeps = {}): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const target = flagValue(args, "--target") ?? "codex";
  if (!isTarget(target)) {
    throw new Error("Usage: neptune doctor [--target codex|claude|all] [--api-url <url>]");
  }

  const stored = await loadConfig(deps.configPath);
  const env = resolveNeptuneEnv(deps.env, stored);
  const apiUrl = flagValue(args, "--api-url") ?? env.apiUrl;
  const execFile = deps.execFile ?? execFileAsync;

  const checks: Check[] = [];
  checks.push(await captureCheck("node", () => assertNodeVersion(deps.nodeVersion ?? process.versions.node)));
  checks.push(
    await captureCheck("auth", () => {
      if (!stored.auth?.accessToken) throw new Error("Not logged in. Run `neptune login` or `neptune setup`.");
      return `logged in as ${stored.auth.user.email ?? stored.auth.user.id}`;
    })
  );
  checks.push(await captureCheck("backend", () => fetchHealth(apiUrl, deps.fetch)));
  checks.push(
    await captureCheck("me", async () => {
      const me = await getMe({
        configPath: deps.configPath,
        env: { ...deps.env, NEPTUNE_API_URL: apiUrl },
        fetch: deps.fetch
      });
      return me.user.email ?? me.user.display_name ?? me.user.id;
    })
  );
  checks.push(
    await captureCheck("repo binding", async () => {
      const binding = await loadProjectBinding(deps.cwd);
      if (!binding) throw new Error("Current repo is not bound. Run `neptune setup`.");
      return `${binding.org_slug}/${binding.project_slug}`;
    })
  );

  if (target === "codex" || target === "all") {
    checks.push(await captureCheck("codex config", () => checkCodexConfig(deps.codexConfigPath)));
  }

  if (target === "claude" || target === "all") {
    checks.push(
      await captureCheck("claude config", () => {
        return checkClaudeConfig(execFile);
      })
    );
  }

  checks.push(await captureCheck("mcp probe", () => (deps.mcpProbe ?? defaultMcpProbe)(apiUrl).then(() => "tools/list ok")));

  for (const check of checks) {
    writeLine(stdout, `${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
  }

  return checks.every((check) => check.ok) ? 0 : 1;
}
