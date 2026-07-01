import {
  createOrg,
  createProject,
  getMe,
  listOrgs,
  listProjects,
  loadConfig,
  requireSupabasePublicConfig,
  resolveNeptuneEnv,
  updateConfig,
  writeProjectBinding,
  type FetchLike
} from "neptune-context";
import { workstreamValues, type Workstream } from "neptune-context-shared";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loginWithGitHub } from "./auth.js";
import { installMcp, type ExecFileLike, type McpInstallTarget } from "./mcp-install.js";

type WritableStream = Pick<NodeJS.WriteStream, "write">;

export type PromptLike = (message: string, defaultValue?: string) => Promise<string>;

export type SetupDeps = {
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: FetchLike;
  stdout?: WritableStream;
  login?: typeof loginWithGitHub;
  codexConfigPath?: string;
  execFile?: ExecFileLike;
  cwd?: string;
  prompt?: PromptLike;
  commandName?: "install" | "setup";
};

function writeLine(stream: WritableStream, value = "") {
  stream.write(`${value}\n`);
}

function flagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function humanNameFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function isTarget(value: string): value is McpInstallTarget {
  return ["codex", "claude", "all"].includes(value);
}

function isWorkstream(value: string): value is Workstream {
  return workstreamValues.includes(value as Workstream);
}

function validateSlug(value: string, label: string) {
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(value)) {
    throw new Error(`${label} must be a lowercase slug using letters, numbers, and hyphens.`);
  }
}

async function defaultPrompt(message: string, defaultValue?: string) {
  const rl = createInterface({ input, output });
  try {
    const suffix = defaultValue ? ` [${defaultValue}]` : "";
    const answer = await rl.question(`${message}${suffix}: `);
    return answer.trim() || defaultValue || "";
  } finally {
    rl.close();
  }
}

async function promptRequired(prompt: PromptLike, message: string, defaultValue?: string) {
  const value = (await prompt(message, defaultValue)).trim();
  if (!value) {
    throw new Error(`${message} is required.`);
  }
  return value;
}

async function ensureLogin(deps: SetupDeps, apiUrlOverride?: string) {
  let stored = await loadConfig(deps.configPath);
  let env = resolveNeptuneEnv(deps.env, {
    ...stored,
    apiUrl: apiUrlOverride ?? stored.apiUrl
  });

  if (apiUrlOverride && stored.apiUrl !== apiUrlOverride) {
    stored = await updateConfig((config) => ({ ...config, apiUrl: apiUrlOverride }), deps.configPath);
    env = resolveNeptuneEnv(deps.env, stored);
  }

  if (stored.auth?.accessToken) {
    return;
  }

  const publicConfig = requireSupabasePublicConfig(env);
  const auth = await (deps.login ?? loginWithGitHub)({
    ...publicConfig,
    stdout: deps.stdout
  });

  await updateConfig(
    (config) => ({
      ...config,
      apiUrl: env.apiUrl,
      supabaseUrl: publicConfig.supabaseUrl,
      supabaseAnonKey: publicConfig.supabaseAnonKey,
      auth
    }),
    deps.configPath
  );
}

export async function runSetup(args: string[], deps: SetupDeps = {}): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const prompt = deps.prompt ?? defaultPrompt;
  const commandName = deps.commandName ?? "setup";
  const apiUrl = flagValue(args, "--api-url");
  const runDeps = apiUrl ? { ...deps, env: { ...deps.env, NEPTUNE_API_URL: apiUrl } } : deps;
  const targetInput = flagValue(args, "--target");
  const target = targetInput ?? (await promptRequired(prompt, "MCP install target", "codex"));
  const workstreamInput = flagValue(args, "--workstream") ?? "general";

  if (!isTarget(target)) {
    throw new Error(`Usage: neptune ${commandName} [--api-url <url>] [--org <slug>] [--project <slug>] [--workstream <workstream>] [--target codex|claude|all]`);
  }

  if (!isWorkstream(workstreamInput)) {
    throw new Error(`Invalid workstream: ${workstreamInput}`);
  }

  await ensureLogin({ ...runDeps, stdout }, apiUrl);

  const me = await getMe(runDeps);
  const orgs = (await listOrgs(runDeps)).orgs;
  const orgDefault = orgs[0]?.slug;
  const orgSlug = flagValue(args, "--org") ?? (await promptRequired(prompt, "Org slug", orgDefault));
  validateSlug(orgSlug, "Org slug");

  let org = orgs.find((candidate) => candidate.slug === orgSlug);
  if (!org) {
    org = (await createOrg(orgSlug, humanNameFromSlug(orgSlug), runDeps)).org;
  }

  const projects = (await listProjects(org.id, runDeps)).projects;
  const projectDefault = projects[0]?.slug;
  const projectSlug = flagValue(args, "--project") ?? (await promptRequired(prompt, "Project slug", projectDefault));
  validateSlug(projectSlug, "Project slug");

  let project = projects.find((candidate) => candidate.slug === projectSlug);
  if (!project) {
    project = (
      await createProject(
        {
          org_id: org.id,
          slug: projectSlug,
          name: humanNameFromSlug(projectSlug),
          default_workstream: workstreamInput
        },
        runDeps
      )
    ).project;
  }

  const binding = await writeProjectBinding(
    {
      org_slug: org.slug,
      project_slug: project.slug,
      project_id: project.id,
      default_workstream: project.default_workstream ?? workstreamInput
    },
    deps.cwd
  );

  const stored = await loadConfig(deps.configPath);
  const env = resolveNeptuneEnv(runDeps.env, stored);
  await installMcp({
    target,
    apiUrl: apiUrl ?? env.apiUrl,
    codexConfigPath: deps.codexConfigPath,
    execFile: deps.execFile
  });

  writeLine(stdout, "Setup complete.");
  writeLine(stdout, `User: ${me.user.email ?? me.user.display_name ?? me.user.id}`);
  writeLine(stdout, `Org: ${org.slug} (${org.id})`);
  writeLine(stdout, `Project: ${project.slug} (${project.id})`);
  writeLine(stdout, `Repo binding: ${binding.org_slug}/${binding.project_slug} -> ${binding.project_id}`);
  writeLine(stdout, `MCP target: ${target}`);
  return 0;
}
