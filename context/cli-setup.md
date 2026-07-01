# CLI Setup

## Purpose

The CLI is intentionally small. Today it handles login, local session storage, basic org/project bootstrap, member inspection, MCP installation, diagnostics, and logout.

Daily context usage happens inside Codex or Claude Code through MCP.

## Package

```text
packages/cli
package name: @yash_1008/neptune
version: 0.1.13
binary: neptune
language: TypeScript
distribution: npm
global install: npm install -g @yash_1008/neptune@latest
npx install: npx -y @yash_1008/neptune@latest install
```

## Commands

```bash
neptune login
neptune auth status
neptune auth logout
neptune me
neptune orgs
neptune org list
neptune create org <name>
neptune org create <name>
neptune org use <slug-or-id>
neptune org current
neptune org members
neptune projects
neptune project list
neptune create project <name> <org-name-or-slug>
neptune project create <name> <org-name-or-slug>
neptune project bind <project|org/project>
neptune project checkout <project>
neptune project delete <project|org/project>
neptune project current
neptune project unbind
neptune project members
neptune mcp install
neptune install
neptune setup
neptune doctor
neptune logout
```

Implemented now:

```text
login
auth status
logout
me
orgs
org create
org list
org use
org current
org members
projects
project create
project list
project bind
project checkout
project delete
project current
project unbind
project members
mcp install
install
setup
doctor
```

Planned later:

```text
invite commands
```

Repo binding helpers exist in the SDK. `neptune install` writes `.neptune/config.json` for the current repo. `neptune setup` remains a compatibility alias.

## Org and Project Binding

Default org is account/session state stored in:

```text
~/.neptune/config.json
```

Current directory project binding is repo state stored in:

```text
.neptune/config.json
```

Standard flow:

```bash
neptune org create acme
neptune org use acme
neptune project create api --workstream backend
neptune project bind api
neptune current
```

Switch the current directory to another project in the selected org:

```bash
neptune org use acme
neptune project checkout website
neptune current
```

`project checkout` only changes the Neptune project binding for the current directory. It does not run Git checkout, does not accept `org/project`, and does not accept `--org`.

Explicit flow without relying on the default org:

```bash
neptune org create acme
neptune project create api --org acme --workstream backend
neptune project bind acme/api
neptune current
```

Inspection and listing:

```bash
neptune org current
neptune org members
neptune project list
neptune project current
```

Changing the directory binding is just another bind:

```bash
neptune project bind another-project
neptune project bind acme/another-project
```

For default-org-only switching, use checkout:

```bash
neptune project checkout another-project
```

Delete a project:

```bash
neptune project delete acme/another-project
neptune project delete acme/another-project --yes
```

Clear the current directory binding:

```bash
neptune project unbind
```

## Login Flow

```bash
neptune login
```

Login is terminal-first and uses Supabase GitHub OAuth:

```text
CLI starts a localhost callback server
CLI opens the Supabase GitHub login URL
user completes login in the browser
Supabase redirects to http://127.0.0.1:<port>/auth/callback
CLI exchanges the OAuth code for a Supabase session
CLI stores the local session
```

The callback page is intentionally tiny. It only tells the user whether login completed and that they can return to the terminal.

Supabase Auth must allow the local callback redirect URL. For development, configure the Supabase Auth redirect allow-list to include the localhost callback pattern used by the CLI, for example:

```text
http://127.0.0.1:*/auth/callback
```

If the hosted Supabase dashboard does not accept a wildcard port for the project, use a fixed callback port in a later CLI config revision and allow-list that exact URL.

## Local Token Storage

The CLI stores local user auth under:

```text
~/.neptune/config.json
```

If an older config exists at `~/.agentctx/config.json`, the CLI migrates it to `~/.neptune/config.json` on first read.

The file contains:

```text
apiUrl
supabaseUrl
supabaseAnonKey
auth.accessToken
auth.refreshToken
auth.expiresAt
auth.user
```

Storage rules:

```text
directory mode: 0700
file mode: 0600
never print accessToken or refreshToken
never store SUPABASE_SERVICE_ROLE_KEY
logout removes auth from the local config
backend calls refresh the Supabase session before use when the access token is near expiry
```

Public config for login is resolved from:

```text
NEPTUNE_SUPABASE_URL
NEPTUNE_SUPABASE_ANON_KEY
AGENTCTX_SUPABASE_URL        legacy fallback
AGENTCTX_SUPABASE_ANON_KEY   legacy fallback
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
stored config
```

Backend API URL is resolved from:

```text
NEPTUNE_API_URL
AGENTCTX_API_URL             legacy fallback
stored config
http://127.0.0.1:8787
```

## Install Flow

Status: implemented locally.

Flags:

```bash
neptune install --api-url http://127.0.0.1:8787 --org acme --project checkout --workstream backend --target codex
```

If flags are omitted, the CLI prompts for missing org, project, workstream, and MCP target values. The target prompt defaults to `codex`.

```text
neptune install
  |
  v
opens login flow or accepts token
  |
  v
creates or joins org
  |
  v
creates or selects project
  |
  v
writes global config
  |
  v
writes repo binding if run inside a repo
  |
  v
installs MCP config for Codex and/or Claude Code
```

Setup writes the repo binding to:

```text
.neptune/config.json
```

with:

```json
{
  "org_slug": "acme",
  "project_slug": "checkout",
  "project_id": "project-uuid",
  "default_workstream": "backend"
}
```

## Company Email Org Flow

Status: planned. Org/project creation exists, but allowed-domain auto-join is not implemented yet.

```bash
neptune install
```

User with `yash@acme.com` can create:

```text
org: acme
allowed domain: acme.com
```

Other verified `@acme.com` users can join the org.

## Personal Email Org Flow

Status: planned. Explicit invite storage and acceptance are not implemented yet.

Users with Gmail or other shared domains cannot use domain auto-join.

They use invites:

```text
org: yash-personal
join method: invite code or invited email
```

## Codex Install Target

`neptune mcp install` updates:

```text
~/.codex/config.toml
```

Expected config:

```toml
[mcp_servers.neptune]
command = "npx"
args = ["-y", "neptune-context-mcp"]

[mcp_servers.neptune.env]
NEPTUNE_API_URL = "http://127.0.0.1:8787"
```

Implemented command:

```bash
neptune mcp install --target codex
neptune mcp install --target all --dry-run
neptune mcp install --target codex --api-url http://127.0.0.1:8787
```

The installer preserves unrelated Codex config and replaces only Neptune's MCP server blocks.

## Claude Code Install Target

The CLI runs the equivalent of:

```bash
claude mcp remove -s user neptune
claude mcp add --transport stdio --scope user neptune \
  -e NEPTUNE_API_URL=http://127.0.0.1:8787 \
  -- npx -y neptune-context-mcp
```

Implemented command:

```bash
neptune mcp install --target claude
```

## Runtime Requirement

```text
neptune: Node.js >=20
neptune-context-mcp: Node.js >=20
```

The MCP server fails fast on older Node versions. In local verification, `/usr/local/bin/node` was Node 18.15.0 and failed correctly, while `/opt/homebrew/bin/node` was Node 23.11.0 and passed.

## Doctor Checks

Status: implemented locally.

Command:

```bash
neptune doctor --target codex
neptune doctor --target claude
neptune doctor --target all --api-url http://127.0.0.1:8787
```

```text
config file exists
API URL is reachable
auth token exists
current repo has project binding or can select one
Codex MCP config exists if requested
Claude MCP config exists if requested
MCP server starts successfully
```
