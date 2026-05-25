import {
  clearStoredAuth,
  createOrg,
  createProject,
  getMe,
  listOrgMembers,
  listOrgs,
  listProjectMembers,
  listProjects,
  loadConfig,
  requireSupabasePublicConfig,
  resolveNeptuneEnv,
  updateConfig,
  type FetchLike
} from "neptune-context";
import type { Workstream } from "neptune-context-shared";
import { loginWithGitHub } from "./auth.js";
import { runDoctor } from "./doctor.js";
import { loadCliDotEnv } from "./env.js";
import { installMcp, type ExecFileLike, type McpInstallTarget } from "./mcp-install.js";
import { runSetup, type PromptLike } from "./setup.js";

type CliDeps = {
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: FetchLike;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  login?: typeof loginWithGitHub;
  codexConfigPath?: string;
  execFile?: ExecFileLike;
  cwd?: string;
  prompt?: PromptLike;
  nodeVersion?: string;
  mcpProbe?: (apiUrl: string) => Promise<void>;
};

function writeLine(stream: Pick<NodeJS.WriteStream, "write">, value = "") {
  stream.write(`${value}\n`);
}

function flagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function positionalValues(args: string[]) {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value?.startsWith("--")) {
      index += 1;
      continue;
    }
    if (value) values.push(value);
  }
  return values;
}

function humanNameFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function slugFromName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!slug) {
    throw new Error("Name must include at least one letter or number.");
  }

  return slug;
}

function displayNameFromInput(input: string, slug: string, explicitName?: string) {
  if (explicitName) return explicitName;
  return input.trim() === slug ? humanNameFromSlug(slug) : input.trim();
}

function displayUser(user: { email: string | null; display_name: string | null; id: string }) {
  return user.email ?? user.display_name ?? user.id;
}

function printHelp(stdout: Pick<NodeJS.WriteStream, "write">) {
  writeLine(stdout, "Neptune CLI");
  writeLine(stdout, "");
  writeLine(stdout, "Commands:");
  writeLine(stdout, "  neptune login");
  writeLine(stdout, "  neptune auth status");
  writeLine(stdout, "  neptune logout");
  writeLine(stdout, "  neptune me");
  writeLine(stdout, "  neptune orgs");
  writeLine(stdout, "  neptune create org <name> [--name <name>]");
  writeLine(stdout, "  neptune org create <name> [--name <name>]");
  writeLine(stdout, "  neptune org members --org <slug-or-id>");
  writeLine(stdout, "  neptune projects [--org-id <uuid>]");
  writeLine(stdout, "  neptune create project <name> <org-name-or-slug> [--name <name>]");
  writeLine(stdout, "  neptune project create <name> <org-name-or-slug> [--name <name>]");
  writeLine(stdout, "  neptune project members --project <project-id>");
  writeLine(stdout, "  neptune mcp install [--target codex|claude|all] [--api-url <url>] [--dry-run]");
  writeLine(stdout, "  neptune setup [--api-url <url>] [--org <slug>] [--project <slug>] [--workstream <workstream>] [--target codex|claude|all]");
  writeLine(stdout, "  neptune doctor [--target codex|claude|all] [--api-url <url>]");
}

async function resolveOrgId(org: string, deps: CliDeps): Promise<string> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(org)) {
    return org;
  }

  const response = await listOrgs(deps);
  const orgSlug = slugFromName(org);
  const normalizedOrgName = org.trim().toLowerCase();
  const match = response.orgs.find(
    (candidate) => candidate.slug === org || candidate.slug === orgSlug || candidate.name.toLowerCase() === normalizedOrgName
  );

  if (!match) {
    throw new Error(`Org not found: ${org}`);
  }

  return match.id;
}

export async function runCli(argv: string[], deps: CliDeps = {}): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  try {
    loadCliDotEnv();
    const [command, subcommand, ...rest] = argv;

    if (!command || command === "help" || command === "--help" || command === "-h") {
      printHelp(stdout);
      return 0;
    }

    if (command === "login") {
      const stored = await loadConfig(deps.configPath);
      const env = resolveNeptuneEnv(deps.env, stored);
      const publicConfig = requireSupabasePublicConfig(env);
      const auth = await (deps.login ?? loginWithGitHub)({
        ...publicConfig,
        stdout
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

      writeLine(stdout, `Logged in as ${auth.user.email ?? auth.user.id}.`);
      return 0;
    }

    if (command === "logout") {
      await clearStoredAuth(deps.configPath);
      writeLine(stdout, "Logged out.");
      return 0;
    }

    if (command === "auth" && subcommand === "status") {
      const config = await loadConfig(deps.configPath);
      if (!config.auth) {
        writeLine(stdout, "Not logged in.");
        return 1;
      }

      writeLine(stdout, `Logged in as ${config.auth.user.email ?? config.auth.user.id}.`);
      writeLine(stdout, `Token expires at ${new Date(config.auth.expiresAt * 1000).toISOString()}.`);
      return 0;
    }

    if (command === "me") {
      const response = await getMe(deps);
      writeLine(stdout, `${displayUser(response.user)}\t${response.user.id}`);
      writeLine(stdout, `orgs\t${response.orgs.length}`);
      writeLine(stdout, `projects\t${response.projects.length}`);
      return 0;
    }

    if (command === "orgs") {
      const response = await listOrgs(deps);
      for (const org of response.orgs) {
        writeLine(stdout, `${org.slug}\t${org.role}\t${org.id}`);
      }
      return 0;
    }

    if ((command === "org" && subcommand === "create") || (command === "create" && subcommand === "org")) {
      const input = positionalValues(rest)[0];
      if (!input) throw new Error("Usage: neptune create org <name> [--name <name>]");
      const slug = slugFromName(input);
      const name = displayNameFromInput(input, slug, flagValue(rest, "--name"));
      const response = await createOrg(slug, name, deps);
      writeLine(stdout, `Created org ${response.org.slug} (${response.org.id}).`);
      return 0;
    }

    if (command === "org" && subcommand === "members") {
      const org = flagValue(rest, "--org");
      if (!org) throw new Error("Usage: neptune org members --org <slug-or-id>");

      const orgId = await resolveOrgId(org, deps);
      const response = await listOrgMembers(orgId, deps);
      for (const member of response.members) {
        writeLine(stdout, `${displayUser(member.user)}\t${member.role}\t${member.user.id}`);
      }
      return 0;
    }

    if (command === "projects") {
      const orgId = flagValue([subcommand, ...rest].filter(Boolean), "--org-id");
      const response = await listProjects(orgId, deps);
      for (const project of response.projects) {
        writeLine(stdout, `${project.slug}\t${project.role}\t${project.id}`);
      }
      return 0;
    }

    if ((command === "project" && subcommand === "create") || (command === "create" && subcommand === "project")) {
      const positional = positionalValues(rest);
      const input = positional[0];
      const org = flagValue(rest, "--org") ?? positional[1];
      if (!input || !org) {
        throw new Error("Usage: neptune create project <name> <org-name-or-slug> [--name <name>]");
      }

      const orgId = await resolveOrgId(org, deps);
      const slug = slugFromName(input);
      const name = displayNameFromInput(input, slug, flagValue(rest, "--name"));
      const defaultWorkstream = (flagValue(rest, "--workstream") ?? "general") as Workstream;
      const response = await createProject(
        {
          org_id: orgId,
          slug,
          name,
          default_workstream: defaultWorkstream
        },
        deps
      );
      writeLine(stdout, `Created project ${response.project.slug} (${response.project.id}).`);
      return 0;
    }

    if (command === "project" && subcommand === "members") {
      const projectId = flagValue(rest, "--project");
      if (!projectId) throw new Error("Usage: neptune project members --project <project-id>");

      const response = await listProjectMembers(projectId, deps);
      for (const member of response.members) {
        writeLine(
          stdout,
          `${displayUser(member.user)}\t${member.role}\t${member.default_workstream}\t${member.user.id}`
        );
      }
      return 0;
    }

    if (command === "mcp" && subcommand === "install") {
      const target = (flagValue(rest, "--target") ?? "codex") as McpInstallTarget;
      if (!["codex", "claude", "all"].includes(target)) {
        throw new Error("Usage: neptune mcp install [--target codex|claude|all] [--api-url <url>] [--dry-run]");
      }

      const stored = await loadConfig(deps.configPath);
      const env = resolveNeptuneEnv(deps.env, stored);
      const apiUrl = flagValue(rest, "--api-url") ?? env.apiUrl;
      const dryRun = rest.includes("--dry-run");
      const result = await installMcp({
        target,
        apiUrl,
        dryRun,
        codexConfigPath: deps.codexConfigPath,
        execFile: deps.execFile
      });

      if (result.codex) {
        writeLine(stdout, `${dryRun ? "Would update" : "Updated"} Codex MCP config: ${result.codex.path}`);
        if (dryRun) {
          writeLine(stdout, result.codex.toml);
        }
      }

      if (result.claude) {
        writeLine(stdout, `${dryRun ? "Would update" : "Updated"} Claude Code MCP config: neptune`);
        if (dryRun) {
          writeLine(stdout, result.claude.commands);
        }
      }

      return 0;
    }

    if (command === "setup") {
      return await runSetup([subcommand, ...rest].filter(Boolean), {
        configPath: deps.configPath,
        env: deps.env,
        fetch: deps.fetch,
        stdout,
        login: deps.login,
        codexConfigPath: deps.codexConfigPath,
        execFile: deps.execFile,
        cwd: deps.cwd,
        prompt: deps.prompt
      });
    }

    if (command === "doctor") {
      return await runDoctor([subcommand, ...rest].filter(Boolean), {
        configPath: deps.configPath,
        env: deps.env,
        fetch: deps.fetch,
        stdout,
        codexConfigPath: deps.codexConfigPath,
        execFile: deps.execFile,
        cwd: deps.cwd,
        nodeVersion: deps.nodeVersion,
        mcpProbe: deps.mcpProbe
      });
    }

    throw new Error(`Unknown command: ${argv.join(" ")}`);
  } catch (error) {
    writeLine(stderr, (error as Error).message);
    return 1;
  }
}
