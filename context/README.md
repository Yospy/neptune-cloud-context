# Context Directory

Read in this order:

1. `context.md` - product definition, V1 boundaries, architecture.
2. `app-flow.md` - end-to-end user and agent flows.
3. `database-schema.md` - Supabase tables, isolation, RLS.
4. `metadata.md` - routing fields, timestamps, receipts.
5. `backend-api.md` - server responsibilities and endpoints.
6. `sdk.md` - shared TypeScript client logic.
7. `mcp.md` - MCP tools and agent behavior.
8. `progress.md` - latest implementation and test snapshot.
9. `cli-setup.md` - setup commands and Codex/Claude installation.

Core invariant:

```text
Agents coordinate through project-scoped context records.
Markdown is the payload.
Metadata is the routing system.
Supabase is the source of truth.
```

## Current Implementation Status

Verified on 2026-05-23:

```text
implemented:
  GitHub OAuth login through Supabase
  local CLI session storage under ~/.neptune/config.json
  legacy ~/.agentctx/config.json migration
  user profile sync into public.user_profiles
  org creation and org membership
  project creation and project membership
  context create, relevant search, get, read, reference, resolve
  author-owned context notes with manual/agent-inferred source
  Neptune DB RPC rename using neptune_* functions
  SDK package foundation for config/session/API/binding/metadata/receipts
  deterministic SDK metadata inference
  public npm package neptune-context-shared@0.1.7
  public npm package neptune-context@0.1.10
  public npm package neptune-context-mcp@0.1.8 with 6 context-work tools
  public npm package @yash_1008/neptune@0.1.14 with neptune binary
  neptune mcp install for Codex and Claude Code
  neptune install for login/org/project/repo binding/MCP install
  neptune doctor for local install diagnostics
  OpenAI sample bridge in sample.py for model-driven MCP testing
  duplicate org/project slug conflicts mapped to 409 CONFLICT

not yet implemented:
  invite creation/acceptance
  role mutation/admin management
  remote HTTP MCP transport
```

Latest verified flow:

```text
OpenAI sample.py -> Neptune MCP stdio -> neptune-context SDK -> backend HTTP -> Supabase
neptune mcp install -> Codex/Claude MCP config -> neptune-context-mcp -> backend HTTP -> Supabase
```

Latest regression status:

```text
corepack pnpm --filter neptune-context-shared test passed, 29 tests
corepack pnpm --filter @neptune/backend test       passed, 71 tests plus 1 skipped integration
corepack pnpm --filter neptune-context test        passed, 32 tests
corepack pnpm --filter neptune-context-mcp test    passed, 27 tests
corepack pnpm --filter @yash_1008/neptune test     passed, 50 tests
corepack pnpm typecheck                            passed
corepack pnpm test                                 passed
corepack pnpm build                                passed
pnpm pack + clean install smoke                    not yet rerun for author-note release
local MCP stdio tools/list                         not yet rerun for author-note release
live author-note migration                         applied and readback verified
live CLI me/orgs against backend 8787              passed
local MCP stdio tools/list                         passed with exact 5 tools after reduction
```

Runtime caveat:

```text
neptune-context-mcp requires Node >=20 on PATH.
```
