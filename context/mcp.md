# MCP Server

## Purpose

The MCP server is the main product interface for Codex and Claude Code.

Status: implemented locally and verified end-to-end. Backend, SDK, and SDK-backed MCP tools work in tandem. CLI install automation for Codex and Claude Code is implemented.

Users should talk naturally:

```text
Upload context.md to shared context.
Check relevant context for backend auth.
```

The agent calls MCP tools. The MCP server calls the SDK.

Invariant:

```text
MCP tool -> neptune-context SDK method -> backend HTTP route -> Supabase
```

No MCP tool calls Supabase or backend fetch directly.

## Package

```text
packages/mcp
package name: neptune-context-mcp
current published version: 0.1.6
language: TypeScript
transport: stdio for V1
runtime: Node.js >=20
```

## Tool List

```text
require_project_binding
list_relevant_context
get_context
create_context
mark_context_referenced
```

Setup/admin workflows stay in the CLI/SDK/backend, not the agent-facing MCP surface.

Invite tools are planned after backend invite support:

```text
create_org_invite
create_project_invite
accept_invite
list_invites
revoke_invite
```

## Tool Behavior

### require_project_binding

Use first to identify the current repo's Neptune project.

### create_context

Use after metadata is known.

Must return a deterministic upload receipt.

### list_relevant_context

Use first to find a project index, and before implementation work when the user mentions a domain, workstream, feature, or "latest context".

Required filters:

```text
project_id
target_workstream
status = active
```

Useful optional filters:

```text
query
domain
code_area
context_type
updated_after
unread_only
```

`query` should be the user's task or the agent's distilled retrieval intent, for example `latest auth login API contract`. Metadata filters should narrow results only when the agent is confident.

Project index lookup:

```text
target_workstream = general
context_type = project_index
limit = 1
```

### get_context

Use after selecting a context summary.

### mark_context_referenced

Use after the agent uses a context to make or verify a code change.

## Agent Instructions

The MCP server descriptions should guide the model:

```text
Do not ask the user to manually tag people.
Prefer project binding from .neptune/config.json.
Ask a confirmation only when project or routing confidence is low.
Always show upload receipts exactly.
Before frontend/backend contract work, call list_relevant_context.
After using context in implementation, call mark_context_referenced.
```

## Error Behavior

Success responses return text plus structuredContent.

SDK errors return:

```json
{
  "code": "CONFLICT",
  "message": "Resource already exists.",
  "status": 409,
  "details": {}
}
```

with `isError: true`.

Duplicate org/project slug edge cases are verified through MCP and now propagate as `CONFLICT` 409.

## Codex Setup

`neptune mcp install --target codex` writes this to `~/.codex/config.toml`:

```toml
[mcp_servers.neptune]
command = "npx"
args = ["-y", "neptune-context-mcp"]

[mcp_servers.neptune.env]
NEPTUNE_API_URL = "https://abc123.ngrok-free.app"
```

## Claude Code Setup

`neptune mcp install --target claude` runs the Claude Code CLI equivalent:

```bash
claude mcp remove -s user neptune
claude mcp add --transport stdio --scope user neptune \
  -e NEPTUNE_API_URL=http://127.0.0.1:8787 \
  -- npx -y neptune-context-mcp
```

Check in Claude Code:

```text
/mcp
```

## Verified Status

Verified on 2026-05-19:

```text
tool list exposes exact 5 names
schemas reject invalid inputs
MCP calls SDK methods only
SDK errors become MCP isError responses
context create/list/get/reference works through MCP
resolved contexts are excluded from active relevant results
duplicate org/project slugs return CONFLICT 409 through MCP
sample.py can let an OpenAI model call MCP tools
neptune mcp install dry-run and packed clean install smoke passed
neptune setup and neptune doctor are implemented locally
local MCP stdio tools/list passes with /opt/homebrew/bin/node
```
