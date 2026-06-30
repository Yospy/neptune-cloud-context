# Project Checkout Binding

## Scope

Add a focused CLI command for switching the current directory to another Neptune project inside the selected org:

- `neptune project checkout <project>`

In scope:
- Resolve `<project>` only inside the current/default org from `neptune org use`.
- Write or replace `.neptune/config.json` for the current directory.
- Keep `neptune project unbind` as the explicit disconnect command.
- Update CLI help, docs, and focused tests.

Out of scope:
- Git branch checkout or switching.
- `org/project` syntax.
- `--org` support.
- Backend, SDK, MCP, or database changes.

## Assumptions

- Users already select the org with `neptune org use <org>`.
- Checkout is a friendly project-binding switch, not a Git command.
- `project bind` remains the flexible command for explicit `org/project` and `--org` flows.

## Architectural Decisions

- Implement checkout in CLI command parsing only.
- Reuse existing project list API and `writeProjectBinding`.
- Keep error messages direct when no default org exists or the project is missing in that org.

## Tasks

1. Add `project checkout` help text and parser branch.
2. Add default-org-only project resolution.
3. Add focused CLI tests for success, replacement, missing default org, missing project, and rejected org-qualified input.
4. Update CLI setup docs and task tracking.
5. Run focused CLI tests plus workspace typecheck/test/build.
6. Run independent subagent review.

## Risks

- Users may confuse checkout with Git checkout; docs must clearly say no Git behavior.
- Error handling must not silently fall back to projects in other orgs.
- Existing `project bind` behavior must remain unchanged.

## Verification Strategy

- `corepack pnpm --filter neptune-context-cli test`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- Subagent review focused only on the checkout command and test coverage.

## Verification Results

- `corepack pnpm --filter neptune-context-cli test` passed: 48 tests.
- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed: shared 23, backend 63 plus 1 skipped integration, SDK 30, CLI 48, MCP 24.
- `corepack pnpm build` passed.
- `git diff --check` passed.
- Packed `neptune-context-cli-0.1.12.tgz` successfully.
- Packed manifest rewrote workspace dependencies to:
  - `neptune-context ^0.1.9`
  - `neptune-context-shared ^0.1.6`
- Built CLI help includes `neptune project checkout <project> [--workstream <workstream>]`.
- Subagent review found one issue: bare `--org` was not rejected. Fixed with regression coverage.

## Publish Command

```bash
npm publish /tmp/neptune-checkout-pack/neptune-context-cli-0.1.12.tgz --access public
```
