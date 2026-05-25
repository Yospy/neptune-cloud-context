# Sprint: Rename AgentCtx → Neptune (code & docs)

Date: 2026-05-17

## Scope

Sprint 1 of a two-sprint rename. Touches code, docs, configs, filenames only. **No DB DDL.** Sprint 2 (separate plan) owns the transactional rename of `agentctx_*` SQL functions, trigger, column defaults, and event_type history against the live Supabase via `SUPABASE_DB_URL`.

## Decisions

- **Hard cutover** (no dual-support shim). Nothing in prod; transition layer would be permanent cruft.
- **Rewrite the single migration in place** (`202605160001_…_v0_backend.sql`) rather than stacking a rename migration on top.
- **npm scope `@neptune/*`** despite public-registry collision risk — packages are `private: true` and workspace deps use `workspace:*`, so resolution is local-only.
- **Split DB into Sprint 2** to bound blast radius; Sprint 1 is fully reversible via `git restore`.

## Rename Map

| From | To |
|---|---|
| `AgentCtxConfig` (TS) | `NeptuneConfig` |
| `AgentCtx` (display) | `Neptune` |
| `@agentctx/` (npm scope) | `@neptune/` |
| `AGENTCTX_` (env vars) | `NEPTUNE_` |
| `agentctx_` (SQL functions, event_type literals) | `neptune_` |
| `agentctx-` (sprint slugs) | `neptune-` |
| `'agentctx'` (default `agent_name`) | `'neptune'` |
| `.agentctx/` (config dir) | `.neptune/` |
| `agentctx` (CLI binary, prose) | `neptune` |

## Steps

1. Apply 9 ordered perl substitutions across all files containing `agentctx` (excluding `node_modules/`, `dist/`, `.git/`, `pnpm-lock.yaml`, this sprint file).
2. `git mv` 7 files: 1 migration + 6 sprint files containing `agentctx-` in the filename.
3. Regenerate `pnpm-lock.yaml` via `corepack pnpm install` (workspace package names changed).
4. Verify: `corepack pnpm typecheck && test && build`, plus `grep -ri 'agentctx'` returns 0.
5. Append Review section to this file.

## Known intermediate state (between Sprints 1 and 2)

- Code expects `neptune_*` SQL functions; live DB still has `agentctx_*`.
- Unit tests pass (they use `fake-supabase.ts`).
- Backend dev server pointed at the live DB will fail — do not run between sprints.
- Integration tests (gated by `NEPTUNE_INTEGRATION_TESTS=true`) will fail — do not run between sprints.

## Verification gates

- `pnpm typecheck` exits 0.
- `pnpm test` exits 0.
- `pnpm build` exits 0.
- `grep -ri 'agentctx' . --exclude-dir={node_modules,dist,.git}` returns 0 lines (this sprint file is excluded by the rename pass; if any line appears here it's content not identifiers).
- `git status` shows 7 file renames as renames (not delete+add).

## Risks

- Perl ordering bug double-touches a token → mitigated by specific-before-general ordering, verified against representative tokens.
- Lockfile regen surfaces external dep change → workspace deps only, lockfile diff should be limited to renamed workspace package names.
- Grep miss on a non-standard file extension → final grep gate catches.

## Reversibility

Full revert: `git restore . && git clean -fd sprints/ && corepack pnpm install`.

## Review

Executed 2026-05-17.

**Step 1 — Substitution pass:** 50 files modified by a single ordered `perl -i -pe` pass over the case-insensitive `agentctx` file list (excluding `node_modules/`, `dist/`, `.git/`, `pnpm-lock.yaml`, and this sprint file). All 9 substitutions applied in the documented order.

**Step 2 — File renames:** 7 files renamed via `mv` (the repo is not under its own git, so `git mv` was unavailable — used plain `mv`; tracking is still pending an `init`):
- `supabase/migrations/202605160001_agentctx_v0_backend.sql` → `…_neptune_v0_backend.sql`
- 6 sprint files: `2026-05-1{6,7}-agentctx-*.md` → `…-neptune-*.md`

**Step 3 — Lockfile regen:** `corepack pnpm install` — "Already up to date" (workspace deps via `workspace:*`; no external dep churn). 492ms.

**Step 4 — Verification:**
- `pnpm typecheck`: ✅ shared, backend, cli all pass.
- `pnpm test`: ✅ 55 passed, 1 skipped (integration test, gated by `NEPTUNE_INTEGRATION_TESTS`). Breakdown: shared 6/6, backend 34/34 + 1 skip, cli 15/15.
- `pnpm build`: ✅ all three packages emit `dist/`.
- `grep -ril 'agentctx' .` (excluding vendored dirs + this sprint file): ✅ zero matches.

**Deferred to Sprint 2 (DB rename via `SUPABASE_DB_URL`):**
- Drop old `agentctx_*` functions + `on_auth_user_agentctx_profile_sync` trigger.
- Create `neptune_*` functions from the rewritten migration file.
- Flip `context_reads.agent_name` / `context_references.agent_name` defaults to `'neptune'`.
- Rewrite historical `context_events.event_type` strings (decision pending).
- Post-apply: verify zero `agentctx_*` functions, six `neptune_*` functions.

**Known gap until Sprint 2 lands:** code expects `neptune_*` but live DB has `agentctx_*`. Backend dev server and integration tests against the real DB will fail in this window. Unit tests are unaffected (they use `fake-supabase.ts`).

