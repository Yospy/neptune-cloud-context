# Neptune V1 Context

## Product Definition

Neptune is shared project context for AI coding agents.

It lets Codex and Claude Code coordinate through structured markdown context stored in the cloud. Users do not manually tag people or run many terminal commands. They create or reference markdown, then ask the agent to upload or fetch shared context.

## V1 Shape

```text
Supabase DB/Auth
TypeScript backend API
TypeScript SDK
TypeScript MCP server
TypeScript CLI
self-hosted/local backend URL for development
```

## Non-Goals

```text
No product UI
No billing
No person tagging
No generic docs workspace
No Slack/email notification system
No realtime collaboration editor
```

## Core Principle

```text
Isolation = org + project
Routing = workstream + domain + code area + context type
Payload = markdown
Trust = deterministic receipts + timestamps + hashes
```

## Main User Experience

Current setup primitives:

```bash
neptune login
neptune org create acme
neptune project create checkout --org acme
neptune mcp install --target codex
```

One-command setup:

```bash
npm install -g neptune-context-cli@latest
neptune doctor
```

Daily usage happens inside Codex or Claude Code:

```text
Upload context.md to shared context.
Check relevant context for backend auth.
Create a project called Checkout and bind this repo to it.
Mark the auth context resolved.
```

The agent calls MCP tools. The MCP server calls the SDK. The SDK calls the backend API. The backend stores and reads from Supabase.

## Architecture

```text
Codex / Claude Code
        |
        | MCP tools
        v
Local Neptune MCP server
        |
        | SDK calls
        v
Neptune backend API over HTTPS
        |
        | server-side checks
        v
Supabase Auth + Postgres
```

## Cross-Compatibility

Codex and Claude Code are cross-compatible because both connect to the same MCP server package and backend API.

```text
Claude Code user -> MCP -> backend -> Supabase
Codex user       -> MCP -> backend -> Supabase
```

If both users belong to the same org and project, they see the same context.

## Build Order

```text
1. Supabase schema and RLS        done for core backend
2. Backend API                    done for auth/users/orgs/projects/context lifecycle
3. CLI auth/bootstrap/install      done for first-user setup and doctor
4. SDK                            done for API/binding/metadata/receipts/errors
5. MCP server                     done locally with 17 SDK-backed stdio tools
6. OpenAI sample bridge           done for model-driven MCP testing
7. Package/install automation     done locally, npm publish pending
8. Invite and role management     later backend feature
```

## Verified Backend Scope

The current backend supports:

```text
login session validation
user profile sync
org create/list/member list
project create/list/member list
context create/relevant/get/read/reference/resolve
context author-note create/update with author-only ownership
duplicate org/project slug conflicts as 409 CONFLICT
```

The current SDK/MCP supports:

```text
SDK-backed MCP tools over stdio
repo binding
deterministic metadata inference
structured SDK/MCP error propagation
OpenAI sample.py bridge for tool-calling tests
CLI MCP installer for Codex and Claude Code
```

The current backend does not yet support:

```text
team invites
accept invite
change roles
archive context
```

Remaining distribution/setup gaps:

```text
publish neptune-context-cli and neptune-context-mcp
verify published npm install path
run clean-machine setup/doctor against published packages
ensure Node >=20 is first on PATH for MCP runtime
```
