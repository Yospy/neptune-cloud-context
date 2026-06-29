# Smart Context Retrieval

## Scope

Add an agent-friendly retrieval path that can find project context from natural user intent without requiring the agent to guess workstream, context type, domain, or exact query terms first.

In scope:
- Add a project-wide smart retrieval contract.
- Add a database RPC that hard-filters only by project membership, active status, and optional strict filters.
- Rank candidates by text match, optional routing hints, priority, confidence, and recency.
- Return recent active context as a fallback when the query is vague or misses.
- Expose the retrieval path through backend, SDK, and MCP.
- Keep existing `list_relevant_context` behavior for strict legacy callers.
- Update docs, tests, and publish commands.

Out of scope:
- Embeddings or external vector stores.
- Automatic project-index generation.
- Deleting or resolving existing smoke-test context records.
- Reworking upload metadata beyond what existing context records already store.

## Assumptions

- The primary query planner is an AI agent, so the server must be robust when the agent supplies raw user intent.
- `project_id`, membership, and `status = active` are the only default hard retrieval scope.
- Workstream, domain, context type, and code area should be hints in smart mode, not required filters.
- Strict filtering remains useful and should be explicit.
- Postgres full-text and lightweight text matching are enough for this targeted fix.

## Architectural Decisions

- Add `retrieve_context` / `GET /contexts/retrieve` instead of changing `list_relevant_context` semantics.
- Use one Supabase RPC, `neptune_retrieve_context`, so authorization and ranking stay close to the data.
- Add `mode = smart | strict`; smart mode boosts hints, strict mode hard-filters them.
- Treat no-match and stopword-only intents as recency fallback, not empty results.
- Return concise `match_reason` diagnostics for agent trust and debugging.

## Tasks

1. Add shared schemas/types for smart retrieval.
2. Add Supabase migration for `neptune_retrieve_context`.
3. Update backend route, repository contract, and fake Supabase support.
4. Add SDK `retrieveContext`.
5. Add MCP `retrieve_context` and steer agents to prefer it.
6. Update docs for smart retrieval behavior and legacy strict retrieval.
7. Add focused tests for broad retrieval, fuzzy/weak query fallback, hint boosts, and strict mode.
8. Run focused tests, workspace typecheck/test/build, and pack checks.
9. Run independent subagent review.
10. Document verification and publish/deploy commands.

## Risks

- Ranking changes can hide important context if query scoring dominates recency too much.
- Strict mode must not weaken project membership or active-status isolation.
- Fake Supabase ranking can drift from SQL if tests overfit implementation details.
- Adding a new MCP tool changes the public tool surface and requires package publish order awareness.

## Verification Strategy

- Shared schema tests for smart retrieval input coercion and defaults.
- Backend repository tests:
  - project-wide retrieval without workstream,
  - weak typo/vague intent still returns recent records,
  - hints boost matching context without hiding others,
  - strict mode applies routing filters.
- Backend app route test for `/contexts/retrieve`.
- SDK API test for request path/query.
- MCP tool test for `retrieve_context` validation and forwarding.
- Full `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`.
- Subagent review focused on correctness, compatibility, and missing tests.

## Verification Results

- `corepack pnpm --filter neptune-context-shared test` passed: 23 tests.
- `corepack pnpm --filter @neptune/backend test` passed: 63 tests, 1 skipped integration.
- `corepack pnpm --filter neptune-context test` passed: 30 tests.
- `corepack pnpm --filter neptune-context-mcp test` passed: 24 tests.
- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed: shared 23, backend 63 plus 1 skipped integration, SDK 30, CLI 42, MCP 24.
- `corepack pnpm build` passed.
- Supabase migration `202606290001_smart_context_retrieval.sql` applied with `CREATE FUNCTION`, `REVOKE`, and `GRANT`.
- Live SQL probes against `neptune_retrieve_context` returned recent active records for vague intent and full-text ranked records for specific intent.
- Built MCP `tools/list` includes `retrieve_context` with only `project_id` required.
- Pack verification passed for:
  - `neptune-context-shared-0.1.6.tgz`
  - `neptune-context-0.1.9.tgz`
  - `neptune-context-mcp-0.1.7.tgz`
- Packed manifest dependency rewrites:
  - `neptune-context -> neptune-context-shared ^0.1.6`
  - `neptune-context-mcp -> neptune-context ^0.1.9`, `neptune-context-shared ^0.1.6`
- Independent subagent review was attempted but blocked by account usage limits before completion.

## Publish And Deploy Commands

```bash
npm publish /tmp/neptune-pack-check/neptune-context-shared-0.1.6.tgz --access public
npm publish /tmp/neptune-pack-check/neptune-context-0.1.9.tgz --access public
npm publish /tmp/neptune-pack-check/neptune-context-mcp-0.1.7.tgz --access public
```

Backend must be redeployed or restarted after merge so `GET /contexts/retrieve` is available.
