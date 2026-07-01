import { execFile as nodeExecFile } from "node:child_process";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

export type McpInstallTarget = "codex" | "claude" | "all";

export type ExecFileLike = (
  file: string,
  args: string[]
) => Promise<{ stdout: string; stderr: string }>;

export type McpInstallOptions = {
  target: McpInstallTarget;
  apiUrl: string;
  dryRun?: boolean;
  codexConfigPath?: string;
  execFile?: ExecFileLike;
};

const execFileAsync = promisify(nodeExecFile) as ExecFileLike;

export function defaultCodexConfigPath(home = homedir()) {
  return join(home, ".codex", "config.toml");
}

function tomlString(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function renderCodexNeptuneSection(apiUrl: string) {
  return [
    "[mcp_servers.neptune]",
    "command = \"neptune\"",
    "args = [\"mcp\", \"serve\"]",
    "",
    "[mcp_servers.neptune.env]",
    `NEPTUNE_API_URL = ${tomlString(apiUrl)}`,
    ""
  ].join("\n");
}

function tableName(line: string) {
  const match = line.match(/^\s*\[([^\]]+)\]\s*$/);
  return match?.[1];
}

function isNeptuneMcpTable(name: string | undefined) {
  return name === "mcp_servers.neptune" || name?.startsWith("mcp_servers.neptune.") === true;
}

export function updateCodexConfigToml(current: string, apiUrl: string) {
  if (current.trim() === "") {
    return `${renderCodexNeptuneSection(apiUrl).trimEnd()}\n`;
  }

  const lines = current.split(/\r?\n/);
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    if (tableName(line) && currentBlock.length > 0) {
      blocks.push(currentBlock);
      currentBlock = [];
    }
    currentBlock.push(line);
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  const nextSection = renderCodexNeptuneSection(apiUrl).trimEnd().split("\n");
  const nextBlocks: string[][] = [];
  let inserted = false;

  for (const block of blocks) {
    if (isNeptuneMcpTable(tableName(block[0] ?? ""))) {
      if (!inserted) {
        nextBlocks.push(nextSection);
        inserted = true;
      }
      continue;
    }
    nextBlocks.push(block);
  }

  if (!inserted) {
    if (nextBlocks.length > 0 && nextBlocks[nextBlocks.length - 1]?.some((line) => line.trim())) {
      nextBlocks.push([""]);
    }
    nextBlocks.push(nextSection);
  }

  return `${nextBlocks.map((block) => block.join("\n").trimEnd()).join("\n")}\n`;
}

async function readOptionalFile(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function writePrivateFile(path: string, value: string) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700).catch(() => undefined);
  const tempPath = `${path}.tmp`;
  await writeFile(tempPath, value, { mode: 0o600 });
  await chmod(tempPath, 0o600).catch(() => undefined);
  await rename(tempPath, path);
  await chmod(path, 0o600).catch(() => undefined);
}

export async function installCodexMcp(options: McpInstallOptions) {
  const codexConfigPath = options.codexConfigPath ?? defaultCodexConfigPath();
  const current = await readOptionalFile(codexConfigPath);
  const next = updateCodexConfigToml(current, options.apiUrl);

  if (!options.dryRun) {
    await writePrivateFile(codexConfigPath, next);
  }

  return {
    path: codexConfigPath,
    toml: renderCodexNeptuneSection(options.apiUrl).trimEnd()
  };
}

function claudeAddArgs(apiUrl: string) {
  return [
    "mcp",
    "add",
    "--transport",
    "stdio",
    "--scope",
    "user",
    "neptune",
    "-e",
    `NEPTUNE_API_URL=${apiUrl}`,
    "--",
    "neptune",
    "mcp",
    "serve"
  ];
}

export function renderClaudeCommands(apiUrl: string) {
  return [
    "claude mcp remove -s user neptune",
    `claude ${claudeAddArgs(apiUrl).join(" ")}`
  ].join("\n");
}

function isMissingCommand(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

export async function installClaudeMcp(options: McpInstallOptions) {
  const execFile = options.execFile ?? execFileAsync;
  const commands = renderClaudeCommands(options.apiUrl);

  if (options.dryRun) {
    return { commands };
  }

  try {
    await execFile("claude", ["mcp", "remove", "-s", "user", "neptune"]).catch((error) => {
      if (isMissingCommand(error)) {
        throw error;
      }
    });
    await execFile("claude", claudeAddArgs(options.apiUrl));
  } catch (error) {
    if (isMissingCommand(error)) {
      throw new Error("Claude Code CLI not found. Install Claude Code or use --target codex.");
    }
    throw error;
  }

  return { commands };
}

export async function installMcp(options: McpInstallOptions) {
  const results: { codex?: Awaited<ReturnType<typeof installCodexMcp>>; claude?: { commands: string } } = {};

  if (options.target === "codex" || options.target === "all") {
    results.codex = await installCodexMcp(options);
  }

  if (options.target === "claude" || options.target === "all") {
    results.claude = await installClaudeMcp(options);
  }

  return results;
}
