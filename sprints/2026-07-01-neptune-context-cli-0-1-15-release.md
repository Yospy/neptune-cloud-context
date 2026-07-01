# Neptune Context CLI 0.1.15 Release

## Scope

Bump the self-contained CLI package release target from `neptune-context-cli@0.1.14` to `neptune-context-cli@0.1.15`.

In scope:
- Update `packages/cli/package.json` to `0.1.15`.
- Update current docs/progress references for the CLI release target.
- Verify packed/publish metadata includes the self-contained install changes.

Out of scope:
- Functional changes beyond the version bump.
- Publishing to npm before merge.
- Changing SDK, shared, MCP, backend, or root package versions.

## Assumptions

- `neptune-context-cli@0.1.14` is already published and immutable.
- The published `0.1.14` tarball does not contain PR #14's self-contained install changes.
- `neptune-context-cli@0.1.15` is the next valid publish version.

## Verification Strategy

- `npm view neptune-context-cli version dist-tags --json --registry=https://registry.npmjs.org/`
- `corepack pnpm --filter neptune-context-cli test`
- `corepack pnpm --filter neptune-context-cli build`
- `corepack pnpm --dir packages/cli pack --pack-destination <tmp>` and inspect packed `package.json`.
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- `corepack pnpm publish --dry-run --access public --registry=https://registry.npmjs.org/ --no-git-checks`
- `git diff --check`

## Verification Results

- `npm view neptune-context-cli version dist-tags --json --registry=https://registry.npmjs.org/` returned `latest: 0.1.14`.
- `npm pack neptune-context-cli@latest` confirmed the published `0.1.14` tarball lacks `postinstall.cjs`, `dist/mcp-serve.*`, and the `neptune-context-mcp` dependency.
- `corepack pnpm --filter neptune-context-cli test` passed: 5 files, 51 tests.
- `corepack pnpm --filter neptune-context-cli build` passed.
- `corepack pnpm --dir packages/cli pack --pack-destination /tmp/neptune-cli-015-pack.XrMrcu` produced `neptune-context-cli-0.1.15.tgz`.
- Packed `package.json` confirmed `name: neptune-context-cli`, `version: 0.1.15`, `postinstall: node postinstall.cjs`, and `neptune-context-mcp ^0.1.8`.
- Packed tarball includes `postinstall.cjs` and `dist/mcp-serve.*`.
- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed.
- `corepack pnpm build` passed.
- `corepack pnpm publish --dry-run --access public --registry=https://registry.npmjs.org/ --no-git-checks` from `packages/cli` produced `neptune-context-cli@0.1.15`.
- `git diff --check` passed.

## Review

- Root cause: `neptune-context-cli@0.1.14` was already published before PR #14's self-contained install changes. npm package versions are immutable.
- Minimality: only the CLI version and current release docs/progress changed.
- Publish command after merge: from `packages/cli`, run `corepack pnpm publish --access public --registry=https://registry.npmjs.org/`.
