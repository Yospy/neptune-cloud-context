import {
  clearStoredAuth,
  createOrg,
  createProject,
  deleteProject,
  getMe,
  listOrgMembers,
  listOrgs,
  listProjectMembers,
  listProjects,
  loadConfig,
  loadProjectBinding,
  removeProjectBinding,
  requireSupabasePublicConfig,
  resolveNeptuneEnv,
  updateConfig,
  writeProjectBinding,
  type FetchLike
} from "neptune-context";
import { workstreamValues, type OrgSummary, type ProjectSummary, type Workstream } from "neptune-context-shared";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
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
  writeLine(stdout, "  neptune auth logout");
  writeLine(stdout, "  neptune me");
  writeLine(stdout, "  neptune current");
  writeLine(stdout, "  neptune orgs");
  writeLine(stdout, "  neptune org list");
  writeLine(stdout, "  neptune create org <name> [--name <name>]");
  writeLine(stdout, "  neptune org create <name> [--name <name>]");
  writeLine(stdout, "  neptune org use <slug-or-id>");
  writeLine(stdout, "  neptune org current");
  writeLine(stdout, "  neptune org members [--org <slug-or-id>]");
  writeLine(stdout, "  neptune projects [--org <slug-or-id>|--org-id <uuid>]");
  writeLine(stdout, "  neptune project list [--org <slug-or-id>|--org-id <uuid>]");
  writeLine(stdout, "  neptune create project <name> [<org-name-or-slug>] [--org <slug-or-id>] [--name <name>]");
  writeLine(stdout, "  neptune project create <name> [<org-name-or-slug>] [--org <slug-or-id>] [--name <name>]");
  writeLine(stdout, "  neptune project bind <project|org/project> [--org <slug-or-id>] [--workstream <workstream>]");
  writeLine(stdout, "  neptune project checkout <project> [--workstream <workstream>]");
  writeLine(stdout, "  neptune project delete <project|org/project> [--org <slug-or-id>] [--yes]");
  writeLine(stdout, "  neptune project current");
  writeLine(stdout, "  neptune project unbind");
  writeLine(stdout, "  neptune project members [--project <project-id>]");
  writeLine(stdout, "  neptune mcp install [--target codex|claude|all] [--api-url <url>] [--dry-run]");
  writeLine(stdout, "  neptune install [--api-url <url>] [--org <slug>] [--project <slug>] [--workstream <workstream>] [--target codex|claude|all]");
  writeLine(stdout, "  neptune setup [same options as install]");
  writeLine(stdout, "  neptune doctor [--target codex|claude|all] [--api-url <url>]");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isWorkstream(value: string): value is Workstream {
  return workstreamValues.includes(value as Workstream);
}

function matchOrg(orgs: OrgSummary[], org: string) {
  const orgSlug = slugFromName(org);
  const normalizedOrgName = org.trim().toLowerCase();
  return orgs.find(
    (candidate) =>
      candidate.id === org ||
      candidate.slug === org ||
      candidate.slug === orgSlug ||
      candidate.name?.toLowerCase() === normalizedOrgName
  );
}

async function resolveOrg(org: string, deps: CliDeps): Promise<OrgSummary> {
  const response = await listOrgs(deps);
  const match = matchOrg(response.orgs, org);

  if (!match) {
    throw new Error(`Org not found: ${org}`);
  }

  return match;
}

async function resolveOrgId(org: string, deps: CliDeps): Promise<string> {
  if (isUuid(org)) return org;
  return (await resolveOrg(org, deps)).id;
}

async function loadDefaultOrg(deps: CliDeps) {
  return (await loadConfig(deps.configPath)).defaultOrg;
}

async function requireDefaultOrg(deps: CliDeps) {
  const defaultOrg = await loadDefaultOrg(deps);
  if (!defaultOrg) {
    throw new Error("No org selected. Run `neptune org use <org-slug>` or pass `--org <org-slug>`.");
  }
  return defaultOrg;
}

async function resolveProjectListOrgId(args: string[], deps: CliDeps) {
  const orgId = flagValue(args, "--org-id");
  if (orgId) return orgId;

  const org = flagValue(args, "--org");
  if (org) return await resolveOrgId(org, deps);

  return (await loadDefaultOrg(deps))?.org_id;
}

function projectMatches(project: ProjectSummary, value: string) {
  return project.id === value || project.slug === value || project.slug === slugFromName(value);
}

async function findProjectInOrg(projectInput: string, orgInput: string, deps: CliDeps) {
  const org = await resolveOrg(orgInput, deps);
  const projects = (await listProjects(org.id, deps)).projects;
  const project = projects.find((candidate) => projectMatches(candidate, projectInput));

  if (!project) {
    throw new Error(`Project not found: ${org.slug}/${projectInput}. Run \`neptune project create ${projectInput} --org ${org.slug}\`.`);
  }

  return { org, project };
}

async function findProjectForCheckout(projectInput: string, deps: CliDeps) {
  if (projectInput.includes("/")) {
    throw new Error("Usage: neptune project checkout <project>");
  }

  const defaultOrg = await loadDefaultOrg(deps);
  if (!defaultOrg) {
    throw new Error("No org selected. Run `neptune org use <org-slug>`.");
  }

  const org = await resolveOrg(defaultOrg.org_slug, deps);
  const projects = (await listProjects(org.id, deps)).projects;
  const project = projects.find((candidate) => projectMatches(candidate, projectInput));

  if (!project) {
    throw new Error(`Project not found in current org: ${org.slug}/${projectInput}.`);
  }

  return { org, project };
}

async function findProjectForBinding(target: string, orgInput: string | undefined, deps: CliDeps) {
  const qualified = target.split("/");
  if (qualified.length === 2 && qualified[0] && qualified[1]) {
    return await findProjectInOrg(qualified[1], qualified[0], deps);
  }

  if (qualified.length > 1) {
    throw new Error("Usage: neptune project bind <project|org/project> [--org <slug-or-id>]");
  }

  const defaultOrg = orgInput ? undefined : await loadDefaultOrg(deps);
  const resolvedOrgInput = orgInput ?? defaultOrg?.org_slug;
  if (resolvedOrgInput) {
    return await findProjectInOrg(target, resolvedOrgInput, deps);
  }

  const projects = (await listProjects(undefined, deps)).projects.filter((project) => projectMatches(project, target));
  if (projects.length === 0) {
    throw new Error("No org selected and no matching project found. Run `neptune org use <org-slug>` or pass `--org <org-slug>`.");
  }

  const orgs = (await listOrgs(deps)).orgs;
  const orgById = new Map(orgs.map((org) => [org.id, org]));

  if (projects.length > 1) {
    const matches = projects
      .map((project) => {
        const org = orgById.get(project.org_id);
        return org ? `${org.slug}/${project.slug}` : `${project.org_id}/${project.slug}`;
      })
      .join(", ");
    throw new Error(`Multiple projects match ${target}: ${matches}. Run \`neptune project bind <org>/<project>\`.`);
  }

  const project = projects[0];
  const org = orgById.get(project.org_id);
  if (!org) {
    throw new Error(`Org not found for project ${project.slug}. Run \`neptune project bind ${project.slug} --org <org-slug>\`.`);
  }

  return { org, project };
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

    if (command === "logout" || (command === "auth" && subcommand === "logout")) {
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

    if (command === "current") {
      const defaultOrg = await loadDefaultOrg(deps);
      const binding = await loadProjectBinding(deps.cwd);
      writeLine(stdout, `Org: ${defaultOrg ? `${defaultOrg.org_slug} (${defaultOrg.org_id})` : "not selected"}`);
      writeLine(
        stdout,
        `Project: ${binding ? `${binding.org_slug}/${binding.project_slug} (${binding.project_id})` : "not bound"}`
      );
      return 0;
    }

    if (command === "orgs" || (command === "org" && subcommand === "list")) {
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

    if (command === "org" && subcommand === "use") {
      const input = positionalValues(rest)[0];
      if (!input) throw new Error("Usage: neptune org use <slug-or-id>");

      const org = await resolveOrg(input, deps);
      await updateConfig(
        (config) => ({
          ...config,
          defaultOrg: {
            org_id: org.id,
            org_slug: org.slug
          }
        }),
        deps.configPath
      );
      writeLine(stdout, `Using org ${org.slug} (${org.id}).`);
      return 0;
    }

    if (command === "org" && subcommand === "current") {
      const defaultOrg = await loadDefaultOrg(deps);
      if (!defaultOrg) {
        writeLine(stdout, "No org selected. Run `neptune org use <org-slug>`.");
        return 1;
      }

      writeLine(stdout, `${defaultOrg.org_slug}\t${defaultOrg.org_id}`);
      return 0;
    }

    if (command === "org" && subcommand === "members") {
      const org = flagValue(rest, "--org") ?? positionalValues(rest)[0] ?? (await requireDefaultOrg(deps)).org_slug;

      const orgId = await resolveOrgId(org, deps);
      const response = await listOrgMembers(orgId, deps);
      for (const member of response.members) {
        writeLine(stdout, `${displayUser(member.user)}\t${member.role}\t${member.user.id}`);
      }
      return 0;
    }

    if (command === "projects" || (command === "project" && subcommand === "list")) {
      const legacyProjectsCommand = command === "projects";
      const args = command === "projects" ? [subcommand, ...rest].filter(Boolean) : rest;
      const orgId = legacyProjectsCommand
        ? flagValue(args, "--org-id") ?? (flagValue(args, "--org") ? await resolveOrgId(String(flagValue(args, "--org")), deps) : undefined)
        : await resolveProjectListOrgId(args, deps);
      const response = await listProjects(orgId, deps);
      for (const project of response.projects) {
        writeLine(
          stdout,
          legacyProjectsCommand
            ? `${project.slug}\t${project.role}\t${project.id}`
            : `${project.slug}\t${project.role}\t${project.id}\t${project.default_workstream}`
        );
      }
      return 0;
    }

    if ((command === "project" && subcommand === "create") || (command === "create" && subcommand === "project")) {
      const positional = positionalValues(rest);
      const input = positional[0];
      if (!input) {
        throw new Error("Usage: neptune project create <name> [<org-name-or-slug>] [--org <slug-or-id>] [--name <name>]");
      }
      const org = flagValue(rest, "--org") ?? positional[1] ?? (await requireDefaultOrg(deps)).org_slug;

      const resolvedOrg = await resolveOrg(org, deps);
      const slug = slugFromName(input);
      const name = displayNameFromInput(input, slug, flagValue(rest, "--name"));
      const defaultWorkstream = flagValue(rest, "--workstream") ?? "general";
      if (!isWorkstream(defaultWorkstream)) throw new Error(`Invalid workstream: ${defaultWorkstream}`);
      const response = await createProject(
        {
          org_id: resolvedOrg.id,
          slug,
          name,
          default_workstream: defaultWorkstream
        },
        deps
      );
      writeLine(stdout, `Created project ${resolvedOrg.slug}/${response.project.slug} (${response.project.id}).`);
      return 0;
    }

    if (command === "project" && subcommand === "bind") {
      const target = positionalValues(rest)[0];
      if (!target) throw new Error("Usage: neptune project bind <project|org/project> [--org <slug-or-id>] [--workstream <workstream>]");

      const workstreamOverride = flagValue(rest, "--workstream");
      let parsedWorkstreamOverride: Workstream | undefined;
      if (workstreamOverride) {
        if (!isWorkstream(workstreamOverride)) throw new Error(`Invalid workstream: ${workstreamOverride}`);
        parsedWorkstreamOverride = workstreamOverride;
      }

      const { org, project } = await findProjectForBinding(target, flagValue(rest, "--org"), deps);
      const defaultWorkstream = parsedWorkstreamOverride ?? project.default_workstream;
      const binding = await writeProjectBinding(
        {
          org_slug: org.slug,
          project_slug: project.slug,
          project_id: project.id,
          default_workstream: defaultWorkstream
        },
        deps.cwd
      );
      writeLine(stdout, `Bound repo to ${binding.org_slug}/${binding.project_slug} (${binding.project_id}).`);
      return 0;
    }

    if (command === "project" && subcommand === "checkout") {
      const target = positionalValues(rest)[0];
      if (!target || rest.includes("--org")) throw new Error("Usage: neptune project checkout <project>");

      const workstreamOverride = flagValue(rest, "--workstream");
      let parsedWorkstreamOverride: Workstream | undefined;
      if (workstreamOverride) {
        if (!isWorkstream(workstreamOverride)) throw new Error(`Invalid workstream: ${workstreamOverride}`);
        parsedWorkstreamOverride = workstreamOverride;
      }

      const { org, project } = await findProjectForCheckout(target, deps);
      const defaultWorkstream = parsedWorkstreamOverride ?? project.default_workstream;
      const binding = await writeProjectBinding(
        {
          org_slug: org.slug,
          project_slug: project.slug,
          project_id: project.id,
          default_workstream: defaultWorkstream
        },
        deps.cwd
      );
      writeLine(stdout, `Checked out project ${binding.org_slug}/${binding.project_slug} (${binding.project_id}).`);
      return 0;
    }

    if (command === "project" && subcommand === "current") {
      const binding = await loadProjectBinding(deps.cwd);
      if (!binding) {
        writeLine(stdout, "Current directory is not bound. Run `neptune project bind <project>`.");
        return 1;
      }

      writeLine(stdout, `${binding.org_slug}/${binding.project_slug}\t${binding.default_workstream}\t${binding.project_id}`);
      return 0;
    }

    if (command === "project" && subcommand === "delete") {
      const target = positionalValues(rest)[0];
      if (!target) throw new Error("Usage: neptune project delete <project|org/project> [--org <slug-or-id>] [--yes]");

      const { org, project } = await findProjectForBinding(target, flagValue(rest, "--org"), deps);
      if (!rest.includes("--yes")) {
        const prompt = deps.prompt ?? defaultPrompt;
        const answer = await prompt(`Type ${project.slug} to delete ${org.slug}/${project.slug}`);
        if (answer !== project.slug) {
          throw new Error("Project deletion cancelled.");
        }
      }

      await deleteProject(project.id, deps);
      const binding = await loadProjectBinding(deps.cwd);
      if (binding?.project_id === project.id) {
        await removeProjectBinding(deps.cwd);
      }

      writeLine(stdout, `Deleted project ${org.slug}/${project.slug} (${project.id}).`);
      return 0;
    }

    if (command === "project" && subcommand === "unbind") {
      await removeProjectBinding(deps.cwd);
      writeLine(stdout, "Removed repo project binding.");
      return 0;
    }

    if (command === "project" && subcommand === "members") {
      const projectId = flagValue(rest, "--project") ?? positionalValues(rest)[0] ?? (await loadProjectBinding(deps.cwd))?.project_id;
      if (!projectId) throw new Error("Usage: neptune project members [--project <project-id>]");

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

    if (command === "install" || command === "setup") {
      return await runSetup([subcommand, ...rest].filter(Boolean), {
        configPath: deps.configPath,
        env: deps.env,
        fetch: deps.fetch,
        stdout,
        login: deps.login,
        codexConfigPath: deps.codexConfigPath,
        execFile: deps.execFile,
        cwd: deps.cwd,
        prompt: deps.prompt,
        commandName: command
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
