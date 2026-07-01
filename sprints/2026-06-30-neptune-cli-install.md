# Neptune CLI Install Command

## Scope

Rename the user-facing CLI npm package from `neptune-context-cli` to `neptune` and add `neptune install` as the user-facing setup command.

In scope:
- Rename `packages/cli` package metadata to publish as `neptune`.
- Keep the binary name `neptune`.
- Add `neptune install` as an alias for the existing `neptune setup` flow.
- Keep `neptune setup` working for backward compatibility.
- Update CLI help, tests, and docs for the new install UX.

Out of scope:
- Renaming SDK, shared, MCP, or backend packages.
- Changing MCP package name `neptune-context-mcp`.
- Publishing packages or applying database migrations.

## Assumptions

- Users first install the CLI with `npm install -g neptune@latest` or run it with `npx -y neptune@latest install`.
- `neptune install` should perform the same behavior as current `neptune setup`.
- Internal packages remain:
  - `neptune-context`
  - `neptune-context-shared`
  - `neptune-context-mcp`

## Architectural Decisions

- Keep the workspace folder `packages/cli`; only npm package metadata changes.
- Do not add a separate install implementation; dispatch `install` into `runSetup` to avoid drift.
- Keep `neptune setup` documented as an alias/legacy command.

## Tasks

1. Create sprint/task tracking.
2. Rename CLI package metadata to `neptune`.
3. Add `neptune install` alias in CLI command dispatch/help.
4. Update focused CLI tests.
5. Update context and README docs.
6. Run focused and workspace verification.
7. Run subagent review.
8. Commit, push, and open draft PR.

## Risks

- Existing docs may still mention `neptune-context-cli`.
- Npm package name `neptune` may still be unavailable at publish time despite current registry lookup showing unpublished.
- Users with old global installs must reinstall under the new package name.

## Verification Strategy

- CLI tests must prove `install` dispatches to setup behavior and help lists it.
- Workspace typecheck, build, and tests must pass.
- Subagent review should check for accidental SDK/MCP renames or broad scope creep.

## Verification Results

- `corepack pnpm --filter neptune test` passed: 5 files, 50 tests.
- `git diff --check` passed.
- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed.
- `corepack pnpm build` passed.

## Self-Review

- Minimality: limited to CLI package metadata, install/setup dispatch/help, install-facing doctor guidance, docs, and focused tests.
- Boundaries: SDK, MCP, shared, backend package names and APIs remain unchanged.
- Compatibility: `neptune setup` remains available as an alias.

## Subagent Review

- Result: no blocking findings.
- Confirmed scope stayed limited to the CLI package rename and `neptune install` alias.
- Confirmed SDK, MCP, backend, and shared package names were not renamed.
- Residual risk: npm registry availability for `neptune` is ultimately confirmed at publish time.
