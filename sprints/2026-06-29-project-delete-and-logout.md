# Project Delete and Logout Ergonomics

## Scope

Add a safe project deletion path and make logout easier to discover:

- backend `DELETE /projects/:project_id`
- SDK `deleteProject(projectId)`
- CLI `neptune project delete <project|org/project> [--org <org>] [--yes]`
- CLI `neptune auth logout` alias for existing `neptune logout`

## Assumptions

- Project deletion is permanent and cascades through existing database foreign keys.
- Only project admins may delete projects.
- Existing `neptune logout` remains supported.
- CLI deletion must require explicit confirmation unless `--yes` is passed.

## Architectural Decisions

- Use a RESTful `DELETE /projects/:project_id` endpoint.
- Keep authorization in the backend repository, not only RLS.
- Avoid a new DB migration because existing FKs already cascade from projects.
- Keep MCP unchanged; project admin actions stay in CLI/backend.

## Tasks

1. Add shared delete response type.
2. Add backend repository and route.
3. Add SDK API wrapper.
4. Add CLI delete command and auth logout alias.
5. Update docs and versions.
6. Add focused tests.
7. Run verification.

## Risks

- Destructive command could delete the wrong project if slug resolution is ambiguous.
- Project deletion must not be available to editors/viewers.
- Local repo binding should be cleared when deleting the currently bound project.

## Verification Strategy

- Backend route and repository tests for admin success and non-admin denial.
- SDK API test for DELETE method/path.
- CLI tests for confirmation, `--yes`, binding cleanup, and logout alias.
- Full `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`.

## Verification Results

- `corepack pnpm --filter neptune-context-shared typecheck && corepack pnpm --filter neptune-context-shared test` passed.
- `corepack pnpm --filter @neptune/backend test` passed: 58 tests, 1 skipped integration.
- `corepack pnpm --filter neptune-context test` passed: 29 tests.
- `corepack pnpm --filter neptune-context-cli test` passed: 42 tests.
- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed: shared 21, backend 58 plus 1 skipped integration, SDK 29, CLI 42, MCP 23.
- `corepack pnpm build` passed.
- Pack verification passed for:
  - `neptune-context-shared-0.1.5.tgz`
  - `neptune-context-0.1.8.tgz`
  - `neptune-context-cli-0.1.11.tgz`
- Packed manifest dependency rewrites:
  - `neptune-context -> neptune-context-shared ^0.1.5`
  - `neptune-context-cli -> neptune-context ^0.1.8`, `neptune-context-shared ^0.1.5`
