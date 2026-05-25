# Neptune Rename Cutover Sprint

## Scope

Close the rename gaps after the AgentCtx-to-Neptune code rename: live Supabase RPC/trigger cleanup, local config migration, and legacy environment variable fallback.

## Assumptions

- Neptune is now the product and code name.
- Live Supabase can be updated directly via `SUPABASE_DB_URL`.
- Existing local users may still have `~/.agentctx/config.json`.
- Existing shells may still export `AGENTCTX_*` variables.

## Architectural Decisions

- Keep Neptune as canonical, but add read-only compatibility for old local config and old env names.
- Migrate legacy local config into `~/.neptune/config.json` on first read instead of forcing login.
- Keep new `NEPTUNE_*` env vars higher priority than old `AGENTCTX_*`.
- Drop old DB functions/triggers after creating the Neptune equivalents.

## Step-by-Step Tasks

1. Add CLI legacy config migration.
2. Add CLI legacy environment variable fallback.
3. Add migration cleanup for old DB trigger, old RPC functions, and agent-name defaults.
4. Add tests for config/env compatibility.
5. Run typecheck, tests, and build.
6. Apply the migration to Supabase.
7. Verify live DB has Neptune functions and no old RPC functions.
8. Restart backend and smoke-test CLI/backend.

## Risks

- Dropping old RPCs breaks any stale client still calling old names.
- Legacy env fallback can hide incomplete shell migration if kept forever.
- Applying the full rewritten migration must remain idempotent.

## Verification Strategy

- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- DB query confirms old functions are gone and Neptune functions exist.
- CLI `me`, org listing, and project listing work against live backend.
