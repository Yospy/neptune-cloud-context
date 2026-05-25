# TypeScript SDK

## Purpose

The SDK is shared client logic used by the CLI and MCP server.

```text
CLI -> SDK -> backend API
MCP -> SDK -> backend API
```

The SDK is not the MCP tool layer. It does not expose tools to Codex or Claude Code directly. MCP exposes tools and calls the SDK.

Status: foundation implemented and published to npm. The SDK now owns config/session loading, auth refresh, backend API calls, repo binding helpers, deterministic metadata inference, deterministic SDK errors, and upload receipt formatting.

## Package

```text
packages/sdk
public package name: neptune-context
public shared package: neptune-context-shared
current public version: 0.1.1
language: TypeScript
runtime: Node.js >=20
```

Install:

```bash
npm install neptune-context
```

Import:

```ts
import { createNeptuneClient } from "neptune-context";
```

## Responsibilities

```text
load local config
read auth token
construct backend API client
get current user
list/create orgs
list/create projects
list org/project members
infer context metadata from markdown
validate metadata shape
create context
list relevant context
get context
mark context read
mark context referenced
resolve context
format deterministic receipts
normalize backend errors
```

## Supabase Placeholders

The SDK should treat Supabase env vars as implementation config, not as receipt or log output:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Client-side SDK usage may read only the `NEXT_PUBLIC_*` values. Node/server-side packages may read `SUPABASE_SERVICE_ROLE_KEY` only for explicitly privileged backend flows.

## Local Config

Global user config:

```json
{
  "apiUrl": "https://abc123.ngrok-free.app",
  "supabaseUrl": "https://project.supabase.co",
  "supabaseAnonKey": "redacted",
  "auth": {
    "accessToken": "redacted",
    "refreshToken": "redacted",
    "expiresAt": 1779000000,
    "tokenType": "bearer",
    "user": {
      "id": "auth-user-uuid",
      "email": "user@example.com"
    }
  }
}
```

Current CLI config path:

```text
~/.neptune/config.json
```

Legacy path migrated on first read:

```text
~/.agentctx/config.json
```

Repo binding config:

```json
{
  "org_slug": "acme",
  "project_slug": "checkout",
  "project_id": "proj_123",
  "default_workstream": "frontend"
}
```

## API URL Resolution

Priority:

```text
1. NEPTUNE_API_URL environment variable
2. AGENTCTX_API_URL legacy fallback
3. global config apiUrl
4. local default http://127.0.0.1:8787
```

Dev example:

```bash
export NEPTUNE_API_URL=https://abc123.ngrok-free.app
```

Without `NEPTUNE_API_URL`, the SDK calls the user's own local backend at `http://127.0.0.1:8787`.

## Main SDK Functions

```ts
loadConfig(): NeptuneConfig
loadProjectBinding(cwd: string): ProjectBinding | null

getMe(): Promise<MeResponse>
listOrgs(): Promise<OrgSummary[]>
createOrg(input): Promise<OrgSummary>
listProjects(input?): Promise<ProjectSummary[]>
createProject(input): Promise<ProjectSummary>
listOrgMembers(orgId): Promise<OrgMemberSummary[]>
listProjectMembers(projectId): Promise<ProjectMemberSummary[]>

inferContextMetadata(input: {
  markdown: string;
  cwd?: string;
  filePath?: string;
  hint?: string;
  projectBinding?: ProjectBinding;
}): Promise<InferredContextMetadata>

createContext(input: CreateContextInput): Promise<UploadReceipt>
listRelevantContext(input: RelevantContextInput): Promise<ContextSummary[]>
getContext(id: string): Promise<ContextRecord>
markContextRead(id: string): Promise<void>
markContextReferenced(input: ReferenceInput): Promise<void>
resolveContext(id: string): Promise<void>
```

## Metadata Inference Contract

The SDK should return structured metadata with confidence.

```ts
type InferredContextMetadata = {
  title: string;
  summary: string;
  source_workstream: string;
  target_workstreams: string[];
  domain: string;
  code_areas: string[];
  context_type: string;
  priority: "low" | "normal" | "high" | "blocking";
  tags: string[];
  repo_paths: string[];
  related_files: string[];
  confidence_score: number;
  inference_notes: string;
};
```

If confidence is low, MCP should ask the user before upload.

## Error Handling

SDK errors should be deterministic and agent-readable.

```text
AUTH_REQUIRED
CONFLICT
PROJECT_NOT_BOUND
ORG_ACCESS_DENIED
PROJECT_ACCESS_DENIED
VALIDATION_FAILED
CONTEXT_NOT_FOUND
NETWORK_ERROR
```

## Verified Status

Verified on 2026-05-19:

```text
SDK calls backend with the user's stored bearer token.
SDK preserves backend CONFLICT errors.
SDK metadata inference output validates against createContext-compatible fields.
SDK regression suite passed.
```
