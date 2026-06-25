# App Flow

## One-Time Setup

Current implemented flow:

```text
User runs neptune login
  |
  v
CLI logs in user with GitHub OAuth through Supabase
  |
  v
CLI stores session in ~/.neptune/config.json
  |
  v
User can create/list orgs and projects
  |
  v
User runs neptune mcp install for Codex and/or Claude Code
```

Implemented setup flow:

```text
User runs neptune setup
  |
  v
CLI logs in user
  |
  v
User creates or joins org
  |
  v
User selects or creates project
  |
  v
CLI installs MCP for Codex and/or Claude Code
  |
  v
Repo gets bound to org/project through .neptune/config.json
```

## Project Binding

Each repo should be bound once.

```json
{
  "org_slug": "acme",
  "project_slug": "checkout",
  "project_id": "proj_123",
  "default_workstream": "frontend"
}
```

Project inference order:

```text
1. Read .neptune/config.json
2. Match git remote to a known project
3. Ask user to select project through MCP
4. Ask user to create project through MCP
```

## Company Team Flow

Status: planned. Org/project creation exists, but domain auto-join and invites are not implemented yet.

```text
Admin
  |
  | neptune setup
  | create org acme with domain acme.com
  | create project checkout
  v
Supabase org/project

Backend engineer using Claude Code
  |
  | joins acme
  | selects checkout
  | uploads checkout API context
  v
Shared context stored in project checkout

Frontend engineer using Codex
  |
  | joins acme
  | selects checkout
  | asks for frontend checkout context
  v
Reads backend context and implements frontend
```

## Individual Developer Flow

Status: implemented for login, org creation, project creation, MCP install, and context lifecycle through backend/SDK/MCP.

```text
Developer
  |
  | neptune setup
  | create personal org
  | create project myapp
  v
Same developer runs separate frontend/backend agent tasks

Frontend task
  |
  | uploads auth UI context
  v
Project context target_workstreams = ["backend"]

Backend task
  |
  | asks for backend auth context
  v
Reads auth UI context and builds API
```

## Upload Flow

Status: backend endpoint, SDK wrapper, metadata inference, and MCP wrapper are implemented.

```text
User says: Upload context.md to shared context
  |
  v
Agent reads markdown file
  |
  v
Agent infers metadata
  |
  v
MCP calls create_context
  |
  v
Backend stores context/version/event
  |
  v
Backend returns deterministic receipt
  |
  v
Agent shows receipt to user
```

## Fetch Flow

Status: backend endpoint, SDK wrapper, MCP wrapper, SDK repo binding helpers, `neptune mcp install`, `neptune setup`, and `neptune doctor` are implemented locally.

```text
User says: I am working on backend auth. Check relevant context.
  |
  v
Agent determines current project from .neptune/config.json
  |
  v
MCP calls list_relevant_context with a query such as "backend auth latest context"
  |
  v
Backend filters by project/status/workstream, applies optional filters, ranks query matches, and returns match reasons
  |
  v
Agent reads matching context
  |
  v
Agent marks used context referenced
```

## MCP Test Flow

Status: implemented for local testing.

```text
User runs sample.py with OPENAI_API_KEY in .env
  |
  v
sample.py connects to neptune-context-mcp over stdio
  |
  v
OpenAI model receives MCP tools as function tools
  |
  v
Model chooses tools such as require_project_binding/list_relevant_context/get_context/create_context
  |
  v
MCP calls SDK, SDK calls backend with user's bearer token
  |
  v
Backend reads/writes Supabase and returns structured data
```

## Install Flow

Status: implemented, published to npm, and verified through clean install and MCP tools/list.

```text
User runs neptune mcp install --target codex
  |
  v
CLI writes ~/.codex/config.toml Neptune MCP server entry
  |
  v
Codex starts neptune-context-mcp with npx
  |
  v
MCP reads ~/.neptune/config.json through SDK
  |
  v
SDK calls backend with user's bearer token
```

Claude Code uses the same MCP package, installed through `claude mcp add`.
