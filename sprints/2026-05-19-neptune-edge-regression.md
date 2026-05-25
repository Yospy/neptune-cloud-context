# Neptune Edge Regression Sprint

## Scope

Run a broad edge-case regression pass across CLI, SDK, MCP, and the live local backend.

## Assumptions

- Backend is live at `http://127.0.0.1:8787`.
- Existing local Neptune auth is available in `~/.neptune/config.json`.
- Network publish/install and real Codex/Claude UI checks remain separate final-release checks.

## Verification Matrix

- Automated workspace test/typecheck/build.
- CLI local failure modes: missing auth, invalid setup values, missing binding, bad Node version, missing Claude CLI, backend down, bad Codex config.
- SDK/MCP validation modes: invalid tool inputs, missing binding, bad context IDs, duplicate org/project conflicts.
- Live backend paths: health, auth, setup, doctor, MCP read/write lifecycle, conflict behavior, resolved-context exclusion.

## Results

Final verified on 2026-05-20:

```text
corepack pnpm typecheck: passed
corepack pnpm test: passed
corepack pnpm build: passed
```

Automated test counts:

```text
shared: 6 passed
backend: 38 passed, 1 gated integration skipped
sdk: 24 passed
cli: 28 passed
mcp: 8 passed
```

Local failure-mode simulations passed:

```text
missing auth status
invalid setup target
invalid setup workstream
invalid setup org slug
invalid doctor target
doctor missing auth/binding/backend
doctor malformed/missing repo binding
MCP invalid create_org input
MCP missing project binding error
```

Live backend and SDK/MCP edge checks passed:

```text
GET /health at http://127.0.0.1:8787
SDK duplicate org conflict
SDK duplicate project conflict
SDK missing context returns CONTEXT_NOT_FOUND
SDK relevant includes active context
SDK relevant excludes resolved context
MCP protocol invalid UUID validation
MCP missing context structured CONTEXT_NOT_FOUND
MCP duplicate org structured CONFLICT
```

Real config checks:

```text
real repo .neptune/config.json binding written
real ~/.codex/config.toml Neptune MCP entry written
real Claude Code neptune MCP entry written
neptune doctor --target all passes node/auth/backend/me/binding/codex/claude config
neptune doctor MCP probe fails only because neptune-context-mcp is not published
```

Bug found and fixed:

```text
neptune doctor --target claude/all initially required injected execFile and could not check real Claude config.
Fixed doctor to default to node child_process execFile for real CLI runs.
```

Registry/package status:

```text
neptune-context@0.1.1 is published
neptune-context-shared@0.1.1 is published
neptune-context-mcp is not published: npm 404
neptune-context-cli is not published: npm 404
local tarball clean install passed
```

Final publish/install status:

```text
neptune-context@0.1.2 published to include current SDK exports
neptune-context-mcp@0.1.1 published against neptune-context@0.1.2
neptune-context-cli@0.1.1 published against neptune-context@0.1.2
fresh npm install neptune-context-cli@0.1.1 neptune-context-mcp@0.1.1 passed
fresh install neptune --help passed
fresh install neptune mcp install --dry-run --target all passed
neptune doctor --target all --api-url http://127.0.0.1:8787 passed
```

Still remaining manual app checks:

```text
real Codex app MCP invocation
real Claude Code /mcp invocation
```

Not covered without additional test accounts/state:

```text
permission-denied behavior with a second user
revoked/expired refresh token behavior
```
