# Author Note

## Scope

Add one author-owned note to each Neptune context so agents and teammates can identify the author's intended meaning without turning context into a general comment thread.

In scope:
- Add nullable author-note fields to context storage.
- Accept an optional author note during context creation.
- Add a dedicated author-note update route that only the original context author can use.
- Preserve the author note when other project members update context content.
- Include author-note fields in receipts, summaries, full context records, SDK, and MCP responses.
- Include author notes in retrieval search with stronger weight than body markdown.
- Update docs and package versions for republishing.

Out of scope:
- Multi-comment threads.
- Replies, mentions, notifications, or product UI.
- Backend LLM calls. Agents infer notes client-side/MCP-side and pass them to the API.

## Assumptions

- `contexts.created_by` is the note owner.
- Project members may continue to update context content through existing context upsert behavior.
- Author notes are optional.
- A note source of `manual` means the user supplied it.
- A note source of `agent_inferred` means the creating/updating agent inferred it from markdown or user intent.

## Architectural Decisions

- Store the note directly on `contexts` instead of creating a comments table because the product rule is one author-owned note per context.
- Add a separate `PUT /contexts/:context_id/author-note` endpoint for post-create note edits.
- Do not let `POST /contexts` mutate an existing context's author note unless the existing context has no note yet and the actor is the original author.
- Add `AUTHOR_NOTE_ACCESS_DENIED` as a distinct error so callers can distinguish project access from note ownership.
- Update retrieval SQL and fake Supabase scoring so author-note matches participate in ranking.

## Tasks

1. Create sprint/task tracking.
2. Add Supabase migration for context author-note fields, RPC, and search weighting.
3. Update shared schemas, response types, and error codes.
4. Wire backend repository, route, error mapping, and tests.
5. Update SDK API/receipt formatting and tests.
6. Update MCP create/update tool schemas and tests.
7. Update context docs and package versions.
8. Run focused and workspace verification.
9. Review diff, side effects, and publish commands.

## Risks

- Existing context upserts are title-based; author-note preservation must not accidentally overwrite the original author's note during a content update by another member.
- Search RPC return types must stay aligned with backend `ContextRow` parsing.
- Public package versions must be bumped in dependency order.

## Verification Strategy

- Shared schema/type tests for author-note request validation.
- Backend app/repository tests for create, update, non-author denial, preservation on content updates, and retrieval matching.
- SDK receipt formatting test for author-note output.
- MCP tool tests for create/update schema mapping.
- `corepack pnpm --filter neptune-context-shared test`
- `corepack pnpm --filter @neptune/backend test`
- `corepack pnpm --filter neptune-context test`
- `corepack pnpm --filter neptune-context-mcp test`
- Workspace `corepack pnpm typecheck`
- Workspace `corepack pnpm build`
- Workspace `corepack pnpm test`

## Verification Results

- `corepack pnpm --filter neptune-context-shared test` passed: 29 tests.
- `corepack pnpm --filter @neptune/backend test` passed: 71 tests, 1 skipped integration.
- `corepack pnpm --filter neptune-context test` passed: 32 tests.
- `corepack pnpm --filter neptune-context-mcp test` passed: 27 tests.
- `corepack pnpm --filter neptune-context-cli test` passed: 48 tests.
- `corepack pnpm typecheck` passed.
- `corepack pnpm build` passed.
- `corepack pnpm test` passed.
- `git diff --check` passed.
- Live Supabase migration applied with `psql`: `ALTER TABLE`, `CREATE FUNCTION`, `CREATE INDEX`, `GRANT`.
- Live readback confirmed 4 author-note columns, `neptune_update_context_author_note`, author-note upsert guard, and author-note retrieval/list search.

## Deployment Notes

`supabase/migrations/202606300002_author_note.sql` has been applied to the configured Supabase database.

Publish order:

```bash
corepack pnpm --filter neptune-context-shared publish --access public
corepack pnpm --filter neptune-context publish --access public
corepack pnpm --filter neptune-context-mcp publish --access public
corepack pnpm --filter neptune-context-cli publish --access public
```

Package targets:

```text
neptune-context-shared@0.1.7
neptune-context@0.1.10
neptune-context-mcp@0.1.8
neptune-context-cli@0.1.13
```
