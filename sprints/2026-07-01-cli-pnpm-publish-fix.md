# CLI Pnpm Publish Fix

## Scope

Fix the published CLI package after `@yash_1008/neptune@0.1.13` was published with raw `workspace:^` dependencies through `npm publish`.

In scope:
- Bump `@yash_1008/neptune` to `0.1.14`.
- Document `pnpm publish` as the required publish command for workspace package dependency rewriting.
- Update release/package docs to point users at `0.1.14`.

Out of scope:
- Changing runtime CLI commands.
- Renaming SDK, shared, MCP, backend, or root packages.
- Republishing SDK/shared/MCP packages.

## Assumptions

- The CLI should continue using `workspace:^` internally for local workspace correctness.
- Publishing must use `pnpm publish`; pnpm rewrites `workspace:` dependencies into registry semver ranges in the packed manifest.
- `0.1.13` should be considered a broken release for global npm installs.

## Architectural Decisions

- Keep workspace dependencies in source package metadata.
- Use a patch version bump because the package contents and installability changed, and npm will not allow republishing `0.1.13`.

## Tasks

1. Create sprint/task tracking.
2. Bump CLI package/docs to `0.1.14`.
3. Update publish command guidance to `pnpm publish`.
4. Verify packed metadata rewrites workspace dependencies.
5. Run focused and workspace verification.
6. Commit, push, and open draft PR.

## Risks

- Publishing with `npm publish` again will preserve `workspace:^` dependencies and create another broken release.
- Users who already installed an older global `neptune` binary may still run stale help output until the scoped package installs successfully.

## Verification Strategy

- `corepack pnpm pack` from `packages/cli` must show semver dependencies for `neptune-context` and `neptune-context-shared`.
- Focused CLI tests via `corepack pnpm --filter @yash_1008/neptune test`.
- Workspace typecheck, test, and build.

## Pack Verification

- `corepack pnpm pack --pack-destination <tmp>` from `packages/cli` produced `@yash_1008/neptune@0.1.14`.
- Packed dependencies were registry semver ranges: `neptune-context@^0.1.10` and `neptune-context-shared@^0.1.7`.
- Packed manifest did not contain any `workspace:` dependency values.

## Verification Results

- `corepack pnpm --filter @yash_1008/neptune test` passed: 5 files, 50 tests.
- `git diff --check` passed.
- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed.
- `corepack pnpm build` passed.
- `corepack pnpm publish --dry-run --access public --registry=https://registry.npmjs.org/ --no-git-checks` from `packages/cli` produced `@yash_1008/neptune@0.1.14`.

## Review

- Root cause: `npm publish` uploaded raw pnpm `workspace:^` dependency values, so npm consumers failed with `EUNSUPPORTEDPROTOCOL`.
- Fix: publish a new patch release with pnpm, which rewrites workspace dependencies during pack/publish.
- Residual operational requirement: run the real publish from clean `main` with Node >=20 on PATH.
