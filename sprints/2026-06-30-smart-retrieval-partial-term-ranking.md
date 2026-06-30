# Smart Retrieval Partial-Term Ranking

## Scope

Fix smart context retrieval so natural multi-word intent can rank records that match some meaningful terms instead of falling through to pure recency whenever Postgres websearch semantics require every term.

In scope:
- Replace `neptune_retrieve_context` with smart-mode OR-style term ranking.
- Keep strict mode as exact websearch/full-text filtering.
- Add regression coverage for a partial intent match outranking a newer unrelated fallback.
- Update context docs for smart-mode matching behavior.

Out of scope:
- Embeddings or external vector stores.
- Changing `list_relevant_context` legacy behavior.
- Reworking search weighting beyond the partial-term edge case.

## Assumptions

- Agents often pass raw user intent with extra terms.
- Returning a partial textual match ahead of unrelated recency fallback is better than treating the intent as a total miss.
- Strict mode callers still need deterministic exact routing/query filtering.

## Architectural Decisions

- Add a forward-only Supabase migration that replaces the RPC instead of editing an already-applied migration.
- Use websearch full-text for strict mode.
- Use an OR-combined tsquery for smart ranking only; do not make smart mode hard-filter by intent.
- Keep existing route, SDK, and MCP contracts unchanged.

## Tasks

1. Add sprint/task tracking.
2. Replace smart retrieval RPC with partial-term ranking.
3. Add backend regression coverage for partial-match smart ranking.
4. Update API docs.
5. Run focused tests, typecheck, and build.
6. Review side effects.

## Risks

- OR ranking can over-promote weak one-word matches if weighting is too strong.
- SQL and fake Supabase behavior can drift again if the intended semantics are not documented.
- Strict mode must keep existing all-term match behavior.

## Verification Strategy

- Backend repository regression test for partial-term smart ranking.
- Existing strict-mode test must continue to pass.
- Focused backend test run.
- Workspace `typecheck` and `build`.

## Verification Results

- `corepack pnpm --filter @neptune/backend test` passed: 64 tests, 1 skipped integration.
- `corepack pnpm typecheck` passed.
- `corepack pnpm build` passed.
- `corepack pnpm test` passed: shared 23, backend 64 plus 1 skipped integration, SDK 30, CLI 48, MCP 24.
- SQL migration applied to Supabase with `psql`: `CREATE FUNCTION`, `REVOKE`, and `GRANT`.
- Live DB readback confirmed `neptune_retrieve_context` contains the partial-term match reason.

## Deployment Notes

- No npm package publish is required because the SDK/MCP contracts did not change.
- Backend restart is not required for the RPC replacement if the currently deployed backend already has `GET /contexts/retrieve`.
