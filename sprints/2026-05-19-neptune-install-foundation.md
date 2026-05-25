# Neptune Install Foundation Sprint

## Scope

Make Neptune installable from npm for the first real user path: publishable CLI, publishable MCP package, and `neptune mcp install` for Codex and Claude Code.

`neptune setup`, repo binding automation, invites, and role management remain out of scope.

## Assumptions

- Public CLI package name is `neptune-context-cli`.
- CLI binary remains `neptune`.
- MCP package remains `neptune-context-mcp`.
- MCP transport remains stdio.
- Codex config lives at `~/.codex/config.toml`.
- Claude Code is configured through the `claude mcp` command when available.

## Architectural Decisions

- Keep SDK config/auth shape unchanged.
- Do not place auth tokens, Supabase keys, or service-role keys in MCP config.
- Resolve `NEPTUNE_API_URL` from `--api-url`, current env/config resolution, then the SDK default.
- Update only Neptune's Codex MCP section and preserve unrelated Codex config.
- Use Claude Code's CLI for Claude config instead of editing Claude config files directly.
- Add `--dry-run` for safe preview and regression tests.

## Step-by-Step Tasks

1. Update sprint tracking in `tasks/todo.md`.
2. Rename CLI package metadata to `neptune-context-cli@0.1.0`.
3. Add MCP install implementation for Codex config writing and Claude command invocation.
4. Wire `neptune mcp install` into CLI help and command parsing.
5. Add targeted CLI tests for help, dry-run, Codex preservation/idempotency, Claude invocation, and missing Claude binary.
6. Refresh workspace package state.
7. Run typecheck, tests, build, pack, and clean-install smoke checks.
8. Document verification and compatibility results.

## Risks

- Hand-editing TOML can corrupt unrelated Codex settings if section replacement is too broad.
- Claude command behavior can vary by installed CLI version.
- Publishing with unresolved `workspace:*` dependencies would break installs if `pnpm publish`/`pnpm pack` rewriting is not verified.
- The wider git root is `/Users/yashwadgave/Desktop`, so project tracking should be reviewed before actual publish.

## Verification Strategy

- CLI unit tests cover all new command behavior without mutating real user config.
- Full workspace `typecheck`, `test`, and `build` pass.
- `pnpm pack` tarballs contain `dist/` and `package.json`.
- Clean temporary app installs packed CLI and MCP tarballs.
- Clean smoke confirms `neptune --help`, dry-run install, and MCP binary startup behavior.

## Verification Results

Verified on 2026-05-19:

```text
corepack pnpm install: passed
corepack pnpm --filter neptune-context-cli test: passed, 23 tests
corepack pnpm typecheck: passed
corepack pnpm test: passed
corepack pnpm build: passed
```

Full test counts:

```text
shared: 6 passed
backend: 38 passed, 1 gated integration skipped
sdk: 24 passed
cli: 23 passed
mcp: 8 passed
```

Package verification:

```text
neptune-context-cli-0.1.0.tgz: dist/ and package.json only
neptune-context-mcp-0.1.0.tgz: dist/ and package.json only
packed workspace dependencies rewrote to neptune-context@0.1.1 and neptune-context-shared@0.1.1
clean temporary app installed both tarballs successfully
clean smoke passed: neptune --help
clean smoke passed: neptune mcp install --dry-run --target all
clean smoke passed: neptune-context-mcp binary started
```

Live backend verification:

```text
backend health at http://127.0.0.1:8787: 200 OK
node packages/cli/dist/index.js auth status: logged in as yashwadgave1008@gmail.com
node packages/cli/dist/index.js me: returned user affeda20-1095-4e6c-9506-17bd7c0720dd, 14 orgs, 13 projects
node packages/cli/dist/index.js orgs: returned live org list
MCP stdio client against local built MCP + live backend: listed 17 tools and get_me succeeded
get_me refreshed expired stored auth; auth status expiry advanced to 2026-05-19T09:41:53.000Z
```

Environment note:

```text
Running the MCP child with /usr/local/bin/node failed as expected because that binary is Node 18.15.0.
Running the MCP child with /opt/homebrew/bin/node succeeded because it is Node 23.11.0.
Published/install users need Node >=20 on PATH for neptune-context-mcp.
```

Compatibility review:

```text
existing CLI auth/org/project/member commands unchanged
existing ~/.neptune/config.json shape unchanged
legacy AGENTCTX_* env fallbacks unchanged
Codex install replaces only mcp_servers.neptune and mcp_servers.neptune.* blocks
Claude install uses claude mcp remove/add and is test-injected to avoid mutating real config
MCP config writes only NEPTUNE_API_URL, never auth tokens or Supabase keys
```
