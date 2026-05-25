# MCP Tool Surface Reduction

## Scope

Reduce Neptune MCP to the five highest-value agent context tools.

## Assumptions

- Agents should use MCP mainly to find, read, upload, and reference project context.
- Setup/admin/debug workflows can remain in CLI/SDK/backend without being exposed as MCP tools.
- Existing context APIs should remain unchanged.

## Architectural Decisions

- Keep the MCP surface minimal: `require_project_binding`, `list_relevant_context`, `get_context`, `create_context`, `mark_context_referenced`.
- Do not add project-index-specific tools yet; indexes can be handled through existing context tools once `project_index` is added later.

## Tasks

- Update MCP tool registry to expose only the five tools.
- Update MCP tests to assert the reduced surface.
- Update docs and doctor probe expectations.

## Risks

- Existing users relying on MCP setup/admin tools will need CLI equivalents.
- Tests/docs that assert the old 17-tool surface must be updated.

## Verification

- `corepack pnpm --filter neptune-context-mcp test` passed.
- `corepack pnpm --filter neptune-context-cli test` passed.
- `corepack pnpm typecheck` passed.
- `corepack pnpm --filter neptune-context-mcp build && corepack pnpm --filter neptune-context-cli build` passed.
- Built MCP stdio `tools/list` with Node 23 returned exactly 5 tools.
