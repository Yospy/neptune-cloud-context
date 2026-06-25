# Agent Intent Retrieval

## Scope

Improve `list_relevant_context` so Codex, Claude Code, and other agents can retrieve context from user intent instead of relying only on exact metadata filters.

In scope:
- Add optional `query` support to shared, backend, SDK, and MCP contracts.
- Add optional `updated_after` support where docs already advertise it.
- Move `unread_only` filtering into the database query path.
- Add ranked full-text retrieval with lightweight `match_reason` output.
- Add database indexes for active context retrieval and text search.
- Update context docs and regression tests.

Out of scope:
- Embeddings or external vector stores.
- New MCP tools.
- Automatic project-index generation.
- Live Supabase migration execution.

## Assumptions

- Agents can pass either a raw user instruction or a distilled retrieval phrase as `query`.
- `project_id`, `status = active`, and `target_workstream` remain hard retrieval scope.
- Metadata filters remain optional narrowing hints.
- Full-text search should be implemented with Postgres-native primitives first.
- Existing context summaries may be extended without breaking current consumers.

## Architectural Decisions

- Keep one tool: extend `list_relevant_context` instead of adding a separate search tool.
- Use SQL/RPC for query ranking because Supabase query-builder cannot express blended text ranking, `not exists`, and match reasons cleanly.
- Keep recency fallback when `query` is absent.
- Rank query results by text rank first, then priority, confidence, and recency.
- Return `match_reason` as a concise diagnostic string for agent decision-making.

## Step-by-Step Tasks

1. Add sprint plan and active task tracking.
2. Extend shared schemas/types with `query`, `updated_after`, and optional `match_reason`.
3. Add Supabase migration for search indexes and `neptune_list_relevant_context`.
4. Update backend repository to call the RPC for relevant context retrieval.
5. Update fake Supabase test support or repository tests for query, unread, and updated filters.
6. Update MCP schema/description and SDK types naturally through shared contracts.
7. Update docs to describe agent-intent retrieval and supported filters.
8. Run focused tests, then workspace typecheck/test/build.
9. Run independent subagent verification.
10. Review diff, side effects, and publish commands.

## Risks

- SQL ranking must preserve project membership and active-context isolation.
- Full-text search over `content_md` can be expensive without the expression index.
- Adding optional response fields must not force older clients to change.
- Fake Supabase behavior can drift from RPC behavior if tests are too mock-heavy.

## Verification Strategy

- Shared schema tests for `query`, `updated_after`, and `match_reason`.
- Backend repository tests for:
  - query-ranked results beating newer generic context,
  - `updated_after` filtering,
  - `unread_only` returning older unread rows beyond the first 50 candidates.
- MCP tests for new tool input schema and forwarded arguments.
- Typecheck, full test suite, and build.
- Subagent review of correctness, migration safety, and documentation alignment.
