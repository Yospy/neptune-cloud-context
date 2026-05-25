# Neptune

Neptune is shared project context for AI coding agents.

It gives Codex and Claude Code a project-scoped memory layer: agents write markdown context to a backend, route it with metadata, and fetch the right context later through MCP tools instead of relying on chat history.

Neptune is early-stage software. The current release is useful for local/self-hosted development and agent coordination, but APIs may still change.

## What It Includes

```text
packages/backend/   Self-hosted TypeScript backend API
packages/shared/    Shared schemas and TypeScript types
packages/sdk/       Published SDK: neptune-context
packages/mcp/       Published MCP server: neptune-context-mcp
packages/cli/       Published CLI: neptune-context-cli
supabase/           Database migrations
context/            Architecture and implementation notes
sample.py           OpenAI Responses API + MCP smoke test
```

Published npm packages:

```text
neptune-context-shared  0.1.2
neptune-context         0.1.4
neptune-context-mcp     0.1.4
neptune-context-cli     0.1.7
```

## Architecture

```text
Codex / Claude Code
        |
        | MCP tools
        v
neptune-context-mcp
        |
        | neptune-context SDK
        v
Neptune backend API
        |
        v
Supabase Auth + Postgres
```

Core model:

```text
Isolation = org + project
Routing = workstream + domain + code area + context type
Payload = markdown
Index = project-scoped Project Index context
```

## Requirements

- Node.js >=20, Node 22+ recommended
- Corepack
- pnpm 9.15.4
- Supabase project
- GitHub OAuth enabled in Supabase Auth

For CLI login, allow the local callback URL in Supabase Auth redirect settings:

```text
http://127.0.0.1:*/auth/callback
```

If Supabase does not allow wildcard ports for your project, use the exact callback URL printed during login.

## Backend Setup

Clone and install:

```bash
corepack enable
corepack pnpm install
cp .env.example .env
```

Fill `.env` with your Supabase values.

Apply the SQL migrations in `supabase/migrations/` to your Supabase database. The backend expects the tables, policies, and `neptune_*` RPC functions from those migrations.

Build and run the local backend:

```bash
corepack pnpm --filter @neptune/backend build
corepack pnpm --filter @neptune/backend start
```

Default backend URL:

```text
http://127.0.0.1:8787
```

Health check:

```bash
curl http://127.0.0.1:8787/health
```

Expected:

```json
{"ok":true,"service":"neptune-backend"}
```

## CLI Setup

Install the published CLI:

```bash
npm install -g neptune-context-cli
```

Point the CLI and MCP server at your backend:

```bash
export NEPTUNE_API_URL="http://127.0.0.1:8787"
```

Login and configure Codex/Claude Code:

```bash
neptune login
neptune setup --target all
neptune doctor --target all
```

Useful CLI commands:

```bash
neptune me
neptune orgs
neptune create org "Acme Tools"
neptune projects
neptune create project "Checkout" "Acme Tools"
neptune mcp install --target all
```

Invite commands are not implemented yet.

## MCP Server

Codex and Claude Code use the published MCP server:

```bash
npx -y neptune-context-mcp
```

The MCP surface is intentionally small:

```text
require_project_binding
list_relevant_context
get_context
create_context
mark_context_referenced
```

Verify the MCP schema includes project indexes:

```bash
printf '%s\n%s\n%s\n' \
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"probe","version":"0.0.0"}}}' \
'{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' \
'{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
| npx -y neptune-context-mcp | grep project_index
```

## Project Index

Each project can have one agent-maintained index context:

```text
title = Project Index
context_type = project_index
domain = general
source_workstream = general
target_workstreams = [general]
priority = high
```

Agents use it as a small map to find useful context records quickly. The source of truth remains the individual context records.

Lookup flow:

```text
require_project_binding
-> list_relevant_context(context_type=project_index, target_workstream=general, limit=1)
-> get_context(index_id)
```

## Environment

`.env.example` contains placeholders only.

Required backend values:

```text
NEXT_PUBLIC_SUPABASE_URL       Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY  Supabase anon key
SUPABASE_SERVICE_ROLE_KEY      Backend-only service role key
```

Optional local defaults:

```text
PORT=8787
NEPTUNE_API_URL=http://127.0.0.1:8787
```

Never commit real `.env` files. `SUPABASE_SERVICE_ROLE_KEY` must stay server-side only.

## Development

Run checks:

```bash
corepack pnpm typecheck
corepack pnpm -r --workspace-concurrency=1 test
corepack pnpm build
```

Package-specific examples:

```bash
corepack pnpm --filter @neptune/backend test
corepack pnpm --filter neptune-context test
corepack pnpm --filter neptune-context-mcp test
corepack pnpm --filter neptune-context-cli test
```

Run the OpenAI/MCP smoke sample:

```bash
export NEPTUNE_API_URL="http://127.0.0.1:8787"
python3 sample.py --auto-approve --once "Check the current project index."
```

## Security

Do not report vulnerabilities in public issues. Use GitHub private vulnerability reporting for this repository.

See `SECURITY.md` for details.
