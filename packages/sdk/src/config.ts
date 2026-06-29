import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Workstream } from "neptune-context-shared";
import { workstreamValues } from "neptune-context-shared";
import { NeptuneSdkError } from "./errors.js";

export type StoredAuth = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
  user: {
    id: string;
    email?: string;
  };
};

export type OrgBinding = {
  org_id: string;
  org_slug: string;
};

export type NeptuneConfig = {
  apiUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  defaultOrg?: OrgBinding;
  auth?: StoredAuth;
};

export type ProjectBinding = {
  org_slug: string;
  project_slug: string;
  project_id: string;
  default_workstream: Workstream;
};

export function defaultConfigPath(home = homedir()) {
  return join(home, ".neptune", "config.json");
}

export function legacyConfigPath(home = homedir()) {
  return join(home, ".agentctx", "config.json");
}

export function projectBindingPath(cwd = process.cwd()) {
  return join(cwd, ".neptune", "config.json");
}

async function parseConfig(configPath: string): Promise<NeptuneConfig> {
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as NeptuneConfig;
  return parsed && typeof parsed === "object" ? parsed : {};
}

export async function loadConfig(
  configPath = defaultConfigPath(),
  legacyPath = configPath === defaultConfigPath() ? legacyConfigPath() : undefined
): Promise<NeptuneConfig> {
  try {
    return await parseConfig(configPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      if (legacyPath) {
        try {
          const legacyConfig = await parseConfig(legacyPath);
          await writeConfig(legacyConfig, configPath);
          return legacyConfig;
        } catch (legacyError) {
          if ((legacyError as NodeJS.ErrnoException).code !== "ENOENT") {
            throw legacyError;
          }
        }
      }

      return {};
    }
    throw error;
  }
}

export const readConfig = loadConfig;

export async function writeConfig(
  config: NeptuneConfig,
  configPath = defaultConfigPath()
): Promise<void> {
  const directory = dirname(configPath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700).catch(() => undefined);

  const tempPath = `${configPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(tempPath, 0o600).catch(() => undefined);
  await rename(tempPath, configPath);
  await chmod(configPath, 0o600).catch(() => undefined);
}

export async function updateConfig(
  updater: (config: NeptuneConfig) => NeptuneConfig | Promise<NeptuneConfig>,
  configPath = defaultConfigPath()
): Promise<NeptuneConfig> {
  const current = await loadConfig(configPath);
  const next = await updater(current);
  await writeConfig(next, configPath);
  return next;
}

export async function clearStoredAuth(configPath = defaultConfigPath()) {
  return updateConfig(
    (config) => {
      const { auth: _auth, defaultOrg: _defaultOrg, ...rest } = config;
      return rest;
    },
    configPath
  );
}

export async function removeConfig(configPath = defaultConfigPath()) {
  await rm(configPath, { force: true });
}

export async function getFileMode(configPath = defaultConfigPath()) {
  const fileStat = await stat(configPath);
  return fileStat.mode & 0o777;
}

function isWorkstream(value: unknown): value is Workstream {
  return typeof value === "string" && workstreamValues.includes(value as Workstream);
}

function parseProjectBinding(value: unknown, bindingPath: string): ProjectBinding {
  const candidate = value as Partial<ProjectBinding> | null;

  if (
    !candidate ||
    typeof candidate.org_slug !== "string" ||
    typeof candidate.project_slug !== "string" ||
    typeof candidate.project_id !== "string" ||
    !isWorkstream(candidate.default_workstream)
  ) {
    throw new NeptuneSdkError("VALIDATION_FAILED", `Invalid Neptune project binding: ${bindingPath}.`);
  }

  return {
    org_slug: candidate.org_slug,
    project_slug: candidate.project_slug,
    project_id: candidate.project_id,
    default_workstream: candidate.default_workstream
  };
}

export async function loadProjectBinding(cwd = process.cwd()): Promise<ProjectBinding | null> {
  const bindingPath = projectBindingPath(cwd);

  try {
    const raw = await readFile(bindingPath, "utf8");
    return parseProjectBinding(JSON.parse(raw), bindingPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function requireProjectBinding(cwd = process.cwd()): Promise<ProjectBinding> {
  const binding = await loadProjectBinding(cwd);
  if (!binding) {
    throw new NeptuneSdkError("PROJECT_NOT_BOUND", "This repository is not bound to a Neptune project.");
  }
  return binding;
}

export async function writeProjectBinding(
  binding: ProjectBinding,
  cwd = process.cwd()
): Promise<ProjectBinding> {
  const bindingPath = projectBindingPath(cwd);
  parseProjectBinding(binding, bindingPath);
  await mkdir(dirname(bindingPath), { recursive: true });
  await writeFile(bindingPath, `${JSON.stringify(binding, null, 2)}\n`, { mode: 0o644 });
  return binding;
}

export async function removeProjectBinding(cwd = process.cwd()) {
  await rm(projectBindingPath(cwd), { force: true });
}
