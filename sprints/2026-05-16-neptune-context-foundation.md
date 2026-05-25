# Neptune Context Foundation Sprint

## Scope

Create the first durable context documentation for Neptune V1 so future agents can understand the product, architecture, data model, SDK, MCP server, backend API, CLI setup, and usage flows without re-deriving decisions from chat history.

## Assumptions

- V1 has no product UI.
- Supabase is the database and auth provider.
- TypeScript is used for backend API, SDK, MCP server, and CLI.
- ngrok exposes the local backend over HTTPS during development.
- CLI is used only for bootstrap and diagnostics.
- Codex and Claude Code use the same MCP server and backend, so they are cross-compatible.

## Architectural Decisions

- Company isolation is modeled as org-level access.
- Project isolation is modeled as project membership under an org.
- Context routing does not tag people. It uses project, workstream, domain, code area, and context type.
- User uploads can be natural language. The agent reads the markdown, infers metadata, and calls MCP tools.
- Every upload returns a deterministic receipt with id, project, version, timestamp, and content hash.
- The SDK contains reusable client logic. MCP and CLI are thin wrappers over the SDK.
- The backend API is the server-side authority for auth checks, isolation, persistence, and audit events.

## Tasks

1. Create `context/context.md` as the general source of truth.
2. Create `context/app-flow.md` for company and individual workflows.
3. Create `context/database-schema.md` for Supabase schema and RLS rules.
4. Create `context/sdk.md` for SDK responsibilities and package shape.
5. Create `context/mcp.md` for MCP tools and agent behavior.
6. Create `context/backend-api.md` for backend responsibilities and endpoints.
7. Create `context/cli-setup.md` for terminal usage and Codex/Claude setup.
8. Create `context/metadata.md` for routing metadata and receipts.
9. Review docs for contradictions and missing V1 boundaries.

## Risks

- Docs become too broad and invite overbuilding.
- Agent behavior becomes vague if MCP tool rules are not explicit.
- Project/org isolation can be misunderstood if RLS and API checks are not both documented.

## Verification Strategy

- Confirm all context files exist.
- Review all docs for internal consistency.
- Confirm V1 boundaries are explicit: no UI, no billing, no person-tagging.
- Confirm another agent can infer build order from the docs.

