# Scoped Neptune CLI Package

## Scope

Update the publishable CLI package name from unscoped `neptune` to scoped `@yash_1008/neptune` after npm rejected `neptune` as too similar to an existing package.

In scope:
- Rename only `packages/cli` npm package metadata to `@yash_1008/neptune`.
- Keep the binary command as `neptune`.
- Update install, publish, and context docs to use the scoped package.
- Keep `neptune install` and `neptune setup` behavior unchanged.

Out of scope:
- Renaming SDK, shared, MCP, backend, or root workspace packages.
- Changing command names or backend behavior.

## Assumptions

- `@yash_1008/neptune` is the npm scope/package suggested by the registry account.
- Users install globally with `npm install -g @yash_1008/neptune@latest` and then run `neptune install`.
- `npx` usage must use the scoped package: `npx -y @yash_1008/neptune@latest install`.

## Architectural Decisions

- Keep the executable name stable through the `bin.neptune` field.
- Use the scoped package name in pnpm filters to avoid ambiguity with the private root workspace named `neptune`.

## Tasks

1. Create sprint/task tracking.
2. Rename CLI package metadata to `@yash_1008/neptune`.
3. Update install/publish docs and context package references.
4. Run focused package verification.
5. Review diff and publish instructions.
6. Commit, push, and open draft PR.

## Risks

- The npm account must own/control the `@yash_1008` scope.
- Users must install with the scoped package name even though the command remains `neptune`.

## Verification Strategy

- Focused CLI tests via `corepack pnpm --filter @yash_1008/neptune test`.
- Workspace typecheck, tests, and build.
- Pack dry run for the CLI package to confirm tarball metadata.

## Verification Results

- `corepack pnpm --filter @yash_1008/neptune test` passed: 5 files, 50 tests.
- `git diff --check` passed.
- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed.
- `corepack pnpm build` passed.
- `npm pack --dry-run --json` from `packages/cli` produced package id `@yash_1008/neptune@0.1.13`.
- `npm pkg get name version bin --json` confirmed `bin.neptune` still points to `./dist/index.js`.

## Review

- Root cause: npm rejected the unscoped `neptune` package name as too similar to an existing `Neptune` package.
- Minimality: only `packages/cli` package metadata and install/publish docs changed.
- Compatibility: installed executable remains `neptune`; users run `neptune install` after installing the scoped package.
- Publish command: from `packages/cli`, run `corepack pnpm publish --access public --registry=https://registry.npmjs.org/` so workspace dependencies are rewritten.
