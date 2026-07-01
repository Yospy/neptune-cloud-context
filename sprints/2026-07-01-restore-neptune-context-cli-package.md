# Restore Neptune Context CLI Package

## Scope

Restore the public CLI npm package name to `neptune-context-cli` so users install Neptune without a personal npm scope:

```bash
npm install -g neptune-context-cli
```

In scope:
- Rename only `packages/cli` package metadata from `@yash_1008/neptune` back to `neptune-context-cli`.
- Keep the executable command as `neptune`.
- Publish target is `neptune-context-cli@0.1.14`.
- Update current install, publish, and context docs to remove personal-scope install guidance.
- Keep `neptune install` and `neptune setup` behavior unchanged.

Out of scope:
- Renaming SDK, shared, MCP, backend, or root workspace packages.
- Publishing to npm.
- Changing command names, backend behavior, auth flow, or MCP behavior.
- Removing historical sprint records that document already-merged work.

## Assumptions

- `neptune-context-cli@0.1.13` is the latest published version on npm.
- `neptune-context-cli@0.1.14` has not been published yet.
- The `neptune` executable remains stable through `bin.neptune`.
- `corepack pnpm publish` must be used so workspace dependencies are rewritten in the packed artifact.

## Architectural Decisions

- Keep npm package identity separate from command identity: install package is `neptune-context-cli`, command remains `neptune`.
- Use `neptune-context-cli` in pnpm filters and current docs.
- Preserve old sprint documents as historical records, even if they mention previous package-name experiments.

## Tasks

1. Create sprint/task tracking.
2. Rename CLI package metadata to `neptune-context-cli@0.1.14`.
3. Update current README/context docs and active task state to the restored package name.
4. Search for stale current personal-scope guidance and remove or rewrite it.
5. Run focused CLI tests, pack verification, typecheck/test/build.
6. Review diff, side effects, and publish command.
7. Commit, push, and open a draft PR.

## Risks

- Users with the old `neptune-context-cli@0.1.13` global install need to reinstall or upgrade to get `neptune install`.
- The scoped `@yash_1008/neptune@0.1.14` package already exists; docs must stop presenting it as the universal install path.
- npm publish must run from `packages/cli` using pnpm, not plain npm, to handle workspace dependencies.

## Verification Strategy

- `corepack pnpm --filter neptune-context-cli test`
- `corepack pnpm --filter neptune-context-cli build`
- `corepack pnpm --filter neptune-context-cli pack --pack-destination <tmp>` and inspect packed `package.json`.
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- `git diff --check`

## Verification Results

- `npm view neptune-context-cli version --registry=https://registry.npmjs.org/` returned `0.1.13`, confirming `0.1.14` is available as the next publish target.
- `corepack pnpm --filter neptune-context-cli test` passed: 5 files, 50 tests.
- `corepack pnpm --filter neptune-context-cli build` passed.
- `corepack pnpm --dir packages/cli pack --pack-destination /tmp/neptune-context-cli-pack-check.bP0DqT` produced `neptune-context-cli-0.1.14.tgz`.
- Packed `package.json` confirmed `name: neptune-context-cli`, `version: 0.1.14`, `bin.neptune: ./dist/index.js`, and workspace dependencies rewritten to `neptune-context ^0.1.10` and `neptune-context-shared ^0.1.7`.
- `corepack pnpm publish --dry-run --access public --registry=https://registry.npmjs.org/ --no-git-checks` from `packages/cli` produced `neptune-context-cli@0.1.14`.
- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed.
- `corepack pnpm build` passed.
- `git diff --check` passed.

## Review

- Root cause: the universal install path should remain `npm install -g neptune-context-cli`; the temporary scoped package name made public install guidance personal to the npm account.
- Minimality: only CLI package metadata, current distribution docs, and sprint/task tracking changed.
- Compatibility: installed executable remains `neptune`; users run `neptune install` after installing `neptune-context-cli`.
- Publish command: from `packages/cli`, run `corepack pnpm publish --access public --registry=https://registry.npmjs.org/` after this PR is merged and the working tree is clean.
