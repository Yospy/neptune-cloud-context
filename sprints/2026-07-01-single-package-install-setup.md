# Single Package Install Setup

## Scope

Make this the only npm package install command users need for a complete local Neptune package install:

```bash
npm install -g neptune-context-cli@latest
```

In scope:
- Keep the public package name `neptune-context-cli`.
- Install the MCP runtime as a dependency of `neptune-context-cli`.
- Add a package lifecycle setup launcher so global npm install starts Neptune setup directly.
- Use npm `INIT_CWD` as the setup working directory so `.env` loading and repo binding target the directory where the user ran npm.
- Repoint generated Codex/Claude MCP config at the installed `neptune` CLI package instead of `npx -y neptune-context-mcp`.
- Update current docs to present `npm install -g neptune-context-cli@latest` as the setup entrypoint.

Out of scope:
- Publishing to npm.
- Deleting user data during npm uninstall.
- Removing historical sprint records.
- Changing backend/API behavior.

## Assumptions

- Users run `npm install -g neptune-context-cli@latest` from the repo directory they want to bind.
- npm lifecycle scripts run from the package folder; npm exposes the original invocation directory through `INIT_CWD`.
- The hidden MCP server command can remain under `neptune mcp serve`; user-facing setup docs should not require a separate `neptune install` command.
- `neptune setup`/`neptune install` can remain as manual recovery commands even though the primary install flow is npm install.

## Architectural Decisions

- Bundle the local experience by adding `neptune-context-mcp` as a runtime dependency of `neptune-context-cli`.
- Launch MCP through `neptune mcp serve`, so uninstalling the CLI package also removes the command referenced by MCP configs.
- Keep lifecycle setup in a small `postinstall.cjs` file included in the npm package. It skips non-global installs and CI, but runs setup for normal global installs.
- Continue to use `corepack pnpm publish`; packed workspace dependencies must be rewritten to published semver ranges.

## Tasks

1. Create sprint/task tracking.
2. Add MCP runtime dependency to the CLI package.
3. Add hidden `neptune mcp serve` command that starts the MCP stdio server.
4. Repoint Codex/Claude MCP config generation and doctor probe to `neptune mcp serve`.
5. Add global-install `postinstall` setup launcher using `INIT_CWD`.
6. Update tests for one-package MCP config and package postinstall metadata.
7. Update current docs to use only `npm install -g neptune-context-cli@latest` as the setup entrypoint.
8. Verify focused package tests, packed manifest, workspace checks, and publish dry run.
9. Commit, push, and open/update draft PR.

## Risks

- Interactive npm lifecycle scripts can be skipped by `--ignore-scripts`, CI, or future npm policy. The CLI still keeps manual `neptune setup` as a recovery path.
- If users run global install outside the target repo, setup will bind that directory. This is unavoidable for a one-command npm setup flow.
- Users with old global `@yash_1008/neptune` installs must uninstall that package separately to remove the stale `neptune` binary.

## Verification Strategy

- `corepack pnpm --filter neptune-context-cli test`
- `corepack pnpm --filter neptune-context-cli build`
- `corepack pnpm --dir packages/cli pack --pack-destination <tmp>` and inspect packed `package.json`.
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- `corepack pnpm publish --dry-run --access public --registry=https://registry.npmjs.org/ --no-git-checks`
- `git diff --check`

## Verification Results

- `corepack pnpm --filter neptune-context-cli test` passed: 5 files, 51 tests.
- `corepack pnpm --filter neptune-context-cli typecheck` passed.
- `corepack pnpm --filter neptune-context-cli build` passed.
- `corepack pnpm --dir packages/cli pack --pack-destination /tmp/neptune-single-package-pack.fkNE89` produced `neptune-context-cli-0.1.14.tgz`.
- Packed `package.json` confirmed `postinstall: node postinstall.cjs`, package files include `postinstall.cjs`, and runtime dependencies include `neptune-context-mcp ^0.1.8`.
- Temp-prefix package install with `NEPTUNE_SKIP_POSTINSTALL_SETUP=1 npm install -g --prefix /tmp/neptune-single-package-prefix <tarball>` succeeded; `neptune --help` worked from the temp prefix; npm listed `neptune-context-cli`, `neptune-context-mcp`, `neptune-context`, and `neptune-context-shared`.
- Temp-prefix `neptune mcp serve` stdio smoke exposed `require_project_binding`.
- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed.
- `corepack pnpm build` passed.
- `corepack pnpm publish --dry-run --access public --registry=https://registry.npmjs.org/ --no-git-checks` from `packages/cli` produced `neptune-context-cli@0.1.14`.
- `git diff --check` passed.

## Review

- Minimality: the change keeps the public package name and CLI command stable, adds the MCP package as a runtime dependency, and routes MCP config through the installed `neptune` command.
- Side effects: global npm install now runs interactive setup through `postinstall` unless the install is non-global, CI, or `NEPTUNE_SKIP_POSTINSTALL_SETUP=1`.
- Uninstall behavior: `npm uninstall -g neptune-context-cli` removes the package, binary, and package-installed dependencies. User config remains outside npm package ownership.
- Publish command after merge: from `packages/cli`, run `corepack pnpm publish --access public --registry=https://registry.npmjs.org/`.
