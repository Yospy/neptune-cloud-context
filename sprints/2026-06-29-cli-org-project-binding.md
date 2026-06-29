# CLI Org/Project Binding Ergonomics

## Scope

Make the CLI easier for first-user org/project workflows:

- set and inspect a default org for the account/session
- create projects inside the default org
- bind the current directory to a project
- inspect and clear the current directory binding
- list org members and projects with default-org fallbacks

## Assumptions

- Org/project CRUD already exists in the backend.
- Default org can be local CLI state in `~/.neptune/config.json`.
- Directory project binding remains local repo state in `.neptune/config.json`.
- No backend, database, or MCP tool change is required if binding file shape stays compatible.

## Architectural Decisions

- Keep account/org context global and project binding per directory.
- Keep project binding JSON compatible with existing MCP and SDK reads.
- Preserve existing command forms while adding clearer aliases.
- Do not add server-side defaults in this sprint.

## Tasks

1. Add SDK config typing/helpers for default org and binding removal.
2. Add CLI commands:
   - `neptune org list`
   - `neptune org use <org>`
   - `neptune org current`
   - `neptune project list [--org <org>]`
   - `neptune project create <name> [--org <org>]`
   - `neptune project bind <project|org/project> [--org <org>]`
   - `neptune project current`
   - `neptune project unbind`
   - `neptune current`
3. Update CLI setup docs.
4. Add focused tests.
5. Run typecheck, tests, build, and independent review.

## Risks

- Changing existing command parsing could break old `project create <project> <org>` usage.
- Ambiguous project slugs across orgs need a clear failure message.
- Global default org must not be confused with per-repo project binding.

## Verification Strategy

- Focused SDK config/binding tests.
- Focused CLI command tests.
- Full `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm build`.
- Subagent code review for command behavior, compatibility, and missing tests.

## Verification Results

- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed: shared 21, backend 55 plus 1 skipped integration, SDK 28, CLI 39, MCP 23.
- `corepack pnpm build` passed.
- Subagent review found two issues: stale default org on logout and legacy `neptune projects` compatibility. Both were fixed with regression coverage.
- `corepack pnpm --dir packages/sdk pack --pack-destination /tmp/neptune-pack-check` produced `neptune-context-0.1.7.tgz`.
- `corepack pnpm --dir packages/cli pack --pack-destination /tmp/neptune-pack-check` produced `neptune-context-cli-0.1.10.tgz`.
- Packed package manifests rewrite workspace deps correctly:
  - `neptune-context -> neptune-context-shared ^0.1.4`
  - `neptune-context-cli -> neptune-context ^0.1.7`, `neptune-context-shared ^0.1.4`
