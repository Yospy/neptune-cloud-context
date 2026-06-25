# CLI Setup

## Purpose

The CLI is intentionally small. Today it handles login, local session storage, basic org/project bootstrap, member inspection, MCP installation, diagnostics, and logout.

Daily context usage happens inside Codex or Claude Code through MCP.

## Package

```text
packages/cli
package name: neptune-context-cli
version: 0.1.9
binary: neptune
language: TypeScript
distribution: npm
```

## Commands

```bash
neptune login
neptune auth status
neptune me
neptune orgs
neptune create org <name>
neptune org create <name>
neptune org members
neptune projects
neptune create project <name> <org-name-or-slug>
neptune project create <name> <org-name-or-slug>
neptune project members
neptune mcp install
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
org members
projects
project create
project members
mcp install
setup
doctor
```

Planned later:

```text
invite commands
```

Repo binding helpers exist in the SDK. `neptune setup` writes `.neptune/config.json` for the current repo.

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

## Setup Flow

Status: implemented locally.

Flags:

```bash
neptune setup --api-url http://127.0.0.1:8787 --org acme --project checkout --workstream backend --target codex
```

If flags are omitted, the CLI prompts for missing org, project, workstream, and MCP target values. The target prompt defaults to `codex`.

```text
neptune setup
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
neptune setup
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
neptune-context-cli: Node.js >=20
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
