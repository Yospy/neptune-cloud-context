# Neptune MCP Foundation Sprint

## Scope

Add deterministic SDK metadata inference and create the first MCP server package for Codex/Claude tool access.

## Assumptions

- Backend is already running and must not be started by this sprint.
- MCP tools must call the `neptune-context` SDK only.
- Metadata inference is deterministic V1, not LLM-backed.
- Archive, supersede, invites, and role mutation remain out of scope.

## Architectural Decisions

- Add `inferContextMetadata` to the SDK before exposing `infer_context_metadata` in MCP.
- Publish MCP as `neptune-context-mcp`.
- Use stdio transport for V1.
- Return both MCP text content and structured content for successful tools.
- Normalize SDK failures into MCP `isError` tool results.

## Step-by-Step Tasks

1. Add SDK metadata inference types, implementation, and tests.
2. Add MCP package scaffold, dependencies, TypeScript config, and package scripts.
3. Add MCP tool definitions and map each tool to the SDK.
4. Add MCP unit tests for tool names, SDK mapping, schema failures, and error normalization.
5. Add MCP stdio E2E tests.
6. Run install, typecheck, tests, build, backend health check, live MCP E2E, and code review.
7. Add a root `sample.py` chat bridge that keeps MCP unchanged, exposes stdio MCP tools to the OpenAI Responses API as local function tools, and uses the live backend through the SDK path.

## Risks

- MCP SDK API shape can differ by version; verify against installed package types.
- Live E2E creates persistent smoke records because delete/archive is not implemented.
- Deterministic inference is intentionally conservative and may need later tuning.

## Verification Strategy

- `corepack pnpm install`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- `curl http://127.0.0.1:8787/health`
- MCP stdio client smoke against the built server and live backend.

## Verification Results

Verified on 2026-05-18:

```text
corepack pnpm install: passed
corepack pnpm typecheck: passed
corepack pnpm test: passed
corepack pnpm build: passed
backend health: 200 OK
MCP stdio live E2E: passed
```

Test counts:

```text
shared: 6 tests passed
sdk: 23 tests passed
backend: 34 tests passed, 1 gated integration skipped
cli: 18 tests passed
mcp: 7 tests passed
```

Live MCP E2E records:

```text
org_id: 0b9fb338-80ac-40ca-a6ac-66ef677b649c
org_slug: mcp-e2e-20260518113922
project_id: eafd534d-0149-4ecb-bdd1-3c245f3aae5b
project_slug: project-20260518113922
context_id: 06a4d850-feee-456e-97ac-2587428e6684
```

Confirmed:

```text
17 MCP tools listed through stdio
get_me returned live backend data
infer_context_metadata inferred auth/api_contract metadata
org/project/member/context lifecycle tools mapped through SDK
context read/reference/resolve succeeded through MCP
resolved context was excluded from active relevant results
```

Review notes:

```text
MCP tools call SDK methods/helpers only.
No MCP tool calls Supabase or backend fetch directly.
Successful tools return text and structuredContent.
SDK errors normalize into MCP isError responses.
MCP startup now fails clearly on Node.js <20.
```

OpenAI sample verification:

```text
python3 -m py_compile sample.py: passed
corepack pnpm --filter neptune-context-mcp build: passed
python3 sample.py --once "Who am I in Neptune? Use the MCP tool and summarize the result.": passed
sample.py loaded OPENAI_API_KEY from .env without printing the key
OpenAI selected get_me, sample.py executed get_me through Neptune MCP stdio, and backend returned live user/org/project data
```

MCP edge-case verification on 2026-05-19:

```text
Runner: temporary MCP stdio JSON-RPC client, calling MCP tools only
Result: 25 passed, 0 failed
Live org_id: a8cddabe-00f4-4f8c-926c-642b99ceee7d
Live project_id: fd245bb0-8182-4333-b39d-2926ee810634
Live context_id: a89dd843-3258-4b52-a000-48c2dcd50f3a
```

Covered:

```text
tool list count
valid auth get_me
create org/project happy paths
duplicate org/project slug error propagation
invalid UUID schema rejection
invalid workstream schema rejection
empty required field schema rejection
nonexistent/out-of-scope project access error
missing repo binding PROJECT_NOT_BOUND
corrupt repo binding error propagation
bind/read project binding
generic low-confidence metadata inference
invalid create_context metadata schema rejection
create/list/get/read/reference/resolve context lifecycle
resolved context excluded from active relevant results
missing auth AUTH_REQUIRED
backend unavailable NETWORK_ERROR
```

Finding:

```text
Duplicate org/project slug cases return normalized MCP errors, but backend currently reports INTERNAL_ERROR 500 instead of a clearer duplicate/validation/conflict code.
```
