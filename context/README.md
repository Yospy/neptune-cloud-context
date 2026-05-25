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
  Neptune DB RPC rename using neptune_* functions
  SDK package foundation for config/session/API/binding/metadata/receipts
  deterministic SDK metadata inference
  public npm package neptune-context-shared@0.1.2
  public npm package neptune-context@0.1.4
  public npm package neptune-context-mcp@0.1.4 with 5 context-work tools
  public npm package neptune-context-cli@0.1.7 with neptune binary
  neptune mcp install for Codex and Claude Code
  neptune setup for login/org/project/repo binding/MCP install
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
corepack pnpm --filter @neptune/backend test       passed
corepack pnpm --filter neptune-context test        passed
corepack pnpm --filter neptune-context-mcp test    passed
corepack pnpm --filter neptune-context-cli test    passed, 28 tests
corepack pnpm typecheck                            passed
corepack pnpm test                                 passed
corepack pnpm build                                passed
pnpm pack + clean install smoke                    passed
local MCP stdio tools/list                         passed with Node 23
live backend 8787 duplicate org/project            409 CONFLICT
live CLI me/orgs against backend 8787              passed
local MCP stdio tools/list                         passed with exact 5 tools after reduction
```

Runtime caveat:

```text
neptune-context-mcp requires Node >=20 on PATH.
```
