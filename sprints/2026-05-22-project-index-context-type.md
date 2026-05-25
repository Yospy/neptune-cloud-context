# Project Index Context Type

## Scope

Allow project indexes to be stored as first-class context records.

## Assumptions

- Each project has at most one active index identified by stable title `Project Index`.
- The index is project-scoped through `project_id`.
- The index uses `context_type = project_index`, `domain = general`, and `target_workstreams = [general]`.

## Architectural Decisions

- Add `project_index` as an allowed context type.
- Keep indexes in the existing `contexts` table.
- Do not add new MCP tools, backend routes, CLI commands, or tables.

## Tasks

- Add a Supabase migration for the `contexts.context_type` check constraint.
- Apply the migration directly to the configured Supabase DB.
- Verify the DB accepts `project_index` in the allowed constraint.
- Add `project_index` to shared package schemas and generated dist.
- Add SDK project-index metadata inference.
- Verify MCP `create_context` and `list_relevant_context` accept `project_index`.

## Risks

- Direct DB changes must stay mirrored in repo migrations.

## Verification Strategy

- Query the live DB constraint after applying the migration.

## Verification

- Direct Supabase DB migration applied successfully.
- Live `contexts_context_type_check` now includes `project_index`.
- `corepack pnpm --filter neptune-context-shared test` passed.
- `corepack pnpm --filter neptune-context test` passed.
- `corepack pnpm --filter neptune-context-mcp test` passed.
- `corepack pnpm typecheck` passed.
- `corepack pnpm build` passed.
- `corepack pnpm -r --workspace-concurrency=1 test` passed.
- Built MCP stdio `tools/list` includes `project_index`.
- `corepack pnpm publish --dry-run --no-git-checks` passed for shared, SDK, MCP, and CLI packages.
