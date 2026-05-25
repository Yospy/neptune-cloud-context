# Neptune SDK Foundation Sprint

## Scope

Create `neptune-context` as the reusable Node/TypeScript client layer for the existing CLI and future MCP server.

## Assumptions

- Backend auth, org/project, user profile, and context lifecycle endpoints are implemented.
- OAuth browser login remains owned by `@neptune/cli`.
- SDK is Node-only for V1.
- Live backend smoke tests are optional and require explicit runtime approval because they call external services.

## Architectural Decisions

- SDK owns non-interactive config, env, auth refresh, backend request, repo binding, error normalization, and receipt formatting.
- CLI becomes a thin command wrapper over SDK for backend/config behavior.
- SDK uses `neptune-context-shared` request and response types.
- SDK does not expose service-role config or print token material.

## Step-by-Step Tasks

1. Add SDK package scaffolding.
2. Move reusable CLI config/env/API/auth-refresh internals into SDK.
3. Add SDK client methods for implemented backend endpoints.
4. Add repo binding helpers and deterministic receipt formatter.
5. Refactor CLI to import SDK helpers while keeping OAuth login local.
6. Add SDK unit tests and preserve CLI regression tests.
7. Run typecheck, tests, and build.
8. Review API boundary, security, side effects, and remaining duplication.

## Risks

- CLI behavior could drift while moving shared code.
- SDK may accidentally absorb interactive login concerns.
- Error normalization could hide backend details needed by agents.
- Workspace dependency changes could leave the lockfile inconsistent.

## Verification Strategy

- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- Review exported SDK surface for secrets, service-role usage, and CLI coupling.
