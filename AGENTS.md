# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project: Neptune

Neptune is shared project context for AI coding agents (Codex, Codex). Agents coordinate through structured markdown context stored in Supabase, called through an MCP server and a backend API. There is intentionally no product UI in V1.

Read `context/README.md` first — it defines the canonical reading order for the product/architecture docs in `context/`.

## Commands

All commands use Corepack-managed pnpm 9.15.4 on Node 22+.

```bash
corepack enable
corepack pnpm install
cp .env.example .env             # fill with local Supabase values

# Root (runs across all workspaces)
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm dev                # builds and starts the backend on PORT (default 8787)

# Per-package
corepack pnpm --filter @neptune/backend test
corepack pnpm --filter @neptune/backend test:integration   # requires real Supabase + NEPTUNE_TEST_EMAIL/PASSWORD
corepack pnpm --filter neptune-context-shared build
corepack pnpm --filter neptune-context-cli build

# Single test file (vitest)
corepack pnpm --filter @neptune/backend exec vitest run test/app.test.ts
corepack pnpm --filter @neptune/backend exec vitest run -t "<test name pattern>"

# Diagnostic
node scripts/check-supabase-connection.mjs
```

CLI smoke (after `--filter neptune-context-cli build`):

```bash
node packages/cli/dist/index.js login
node packages/cli/dist/index.js orgs
node packages/cli/dist/index.js project create checkout --org acme
```

CI runs `typecheck`, `test`, `build` on Node 22 — keep all three green.

## Architecture

```
Codex / Codex  →  MCP server  →  SDK  →  Backend API (HTTPS)  →  Supabase (Auth + Postgres)
```

The backend is the single authority between local agents and Supabase. RLS is the database backstop, not the only check — every write must also be authorized by the backend and must produce a `context_events` audit row, and content changes must produce a `context_versions` row.

Core invariant (do not violate when touching schema, queries, or API):

```
Isolation = org + project
Routing   = workstream + domain + code area + context type
Payload   = markdown
Trust     = deterministic receipts + timestamps + hashes
```

### Workspace layout

```
packages/shared/    Zod schemas, enums, types — the contract between backend and CLI
packages/backend/   Hono HTTP server, Supabase repository, auth middleware
packages/cli/       Tiny TS CLI (neptune login / orgs / project ...), Supabase GitHub OAuth via localhost callback
supabase/migrations Postgres schema + RLS
context/            Source-of-truth product/API/schema docs (read in order from context/README.md)
sprints/            Sprint plans (one per feature, dated)
tasks/todo.md       Active sprint task tracking
scripts/            Diagnostics (e.g. Supabase connection check)
```

### Request path (backend)

`packages/backend/src/server.ts` wires:
- `loadEnv` (Zod-validated env) → `createSupabaseAuthClient` (anon, for verifying user JWTs) + `createSupabaseAdminClient` (service role, for repository writes) → `SupabaseContextRepository` → `createApp({ authClient, repository, logger })`.

`createApp` (`app.ts`) mounts Hono routes under `requireAuth` + `syncUserProfile` middleware. Every authenticated route receives a typed `c.var.user: AuthenticatedUser` populated by `auth.ts` from the Supabase JWT. All inputs are validated with Zod schemas from `neptune-context-shared`; validation failures throw `AppError("VALIDATION_FAILED")`, caught by `app.onError` and converted to a JSON error response.

The repository (`repository.ts`) is the only place that talks to Supabase tables. Add new server operations there, not inline in route handlers.

### Shared schemas are the contract

The CLI and backend both import request/response shapes from `neptune-context-shared`. When changing an endpoint:
1. Update the Zod schema and inferred type in `packages/shared/src/schemas.ts` (and `enums.ts`/`types.ts` as needed).
2. Update the route handler in `packages/backend/src/app.ts` and the repository method.
3. Update the CLI call site in `packages/cli/src/api.ts` and `commands.ts`.
4. Tests: `packages/shared/test/schemas.test.ts`, `packages/backend/test/app.test.ts` + `repository.test.ts` (uses `fake-supabase.ts`), `packages/cli/test/*`.

### Environment / secrets

`SUPABASE_SERVICE_ROLE_KEY` is server-only. It must never appear in CLI code, MCP responses, CLI logs/output, examples, issues, or PRs. The backend admin client uses it; the auth client uses the anon key to verify user JWTs.

CLI public config resolution order: `NEPTUNE_SUPABASE_URL` / `NEPTUNE_SUPABASE_ANON_KEY` → `NEXT_PUBLIC_*` → stored config at `~/.neptune/config.json` (chmod 0600). API URL resolution: `NEPTUNE_API_URL` → stored config → `http://127.0.0.1:8787`.

`.env.example` stays placeholder-only; never commit real `.env` values.

## Workflow (project-specific, from CONTRIBUTING.md)

- Non-trivial changes require a sprint plan under `sprints/` (`YYYY-MM-DD-<slug>.md`) before implementation. Active task tracking lives in `tasks/todo.md`.
- User-facing behavior changes should be reflected in the relevant `context/` doc — those files are the source of truth, not just documentation.
- Packages stay `"private": true` until publishing is explicitly planned.
