# Backend API

## Purpose

The backend API is the server-side authority between the local SDK/MCP and Supabase.

It handles:

```text
auth verification
org access checks
project access checks
server-side validation
context persistence
versioning
audit events
deterministic receipts
```

## Runtime

```text
language: TypeScript
framework: Hono
dev exposure: localhost or ngrok HTTPS
database/auth: Supabase
```

## Supabase Environment

Use these placeholders wherever Supabase connection config is needed:

```text
NEXT_PUBLIC_SUPABASE_URL      browser-safe Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY browser-safe anon key for public/client operations
SUPABASE_SERVICE_ROLE_KEY     server-only key for privileged backend operations
```

Rules:

```text
Frontend/client SDK code may only use NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
Backend-only code may use SUPABASE_SERVICE_ROLE_KEY when admin access is explicitly required.
Never expose SUPABASE_SERVICE_ROLE_KEY through frontend bundles, MCP responses, CLI logs, or receipts.
```

## API URL

SDK resolves API URL from:

```text
NEPTUNE_API_URL
global Neptune config
embedded default production URL
```

Development example:

```text
https://abc123.ngrok-free.app
```

## Endpoints

```text
GET  /health
GET  /me

GET  /orgs
POST /orgs
GET  /orgs/:org_id/members

GET  /projects
POST /projects
GET  /projects/:project_id/members

POST /contexts
GET  /contexts/relevant
GET  /contexts/:context_id
POST /contexts/:context_id/read
POST /contexts/:context_id/reference
POST /contexts/:context_id/resolve
```

Not yet implemented:

```text
POST /orgs/:org_id/invites
POST /projects/:project_id/invites
POST /invites/:token/accept
PATCH member roles
archive context
```

## Auth And User Sync

The CLI logs in with Supabase GitHub OAuth and sends:

```text
Authorization: Bearer <supabase_access_token>
```

For every protected request, the backend:

```text
validates token with Supabase Auth
extracts user id/email/provider/profile metadata
upserts public.user_profiles
updates last_seen_at
uses org_members/project_members for authorization
```

## Current User Response

```json
{
  "ok": true,
  "user": {
    "id": "auth-user-uuid",
    "email": "user@example.com",
    "display_name": "User",
    "avatar_url": "https://...",
    "provider": "github",
    "last_seen_at": "2026-05-18T04:00:00Z",
    "created_at": "2026-05-18T04:00:00Z",
    "updated_at": "2026-05-18T04:00:00Z"
  },
  "orgs": [],
  "projects": []
}
```

## Create Context Request

```json
{
  "project_id": "proj_123",
  "title": "Auth UI Login Contract",
  "summary": "Frontend login form sends email/password and expects access and refresh tokens.",
  "content_md": "# Auth UI Login Contract\n...",
  "source_workstream": "frontend",
  "target_workstreams": ["backend"],
  "domain": "auth",
  "code_areas": ["login", "session"],
  "context_type": "ui_contract",
  "priority": "normal",
  "tags": ["login", "jwt"],
  "confidence_score": 0.88,
  "inference_notes": "Inferred frontend to backend from expected API response."
}
```

## Upload Receipt Response

```json
{
  "ok": true,
  "receipt": {
    "context_id": "ctx_8f31",
    "org": "acme",
    "project": "checkout",
    "title": "Auth UI Login Contract",
    "source_workstream": "frontend",
    "target_workstreams": ["backend"],
    "domain": "auth",
    "code_areas": ["login", "session"],
    "context_type": "ui_contract",
    "status": "active",
    "version": 1,
    "created_at": "2026-05-16T12:04:22Z",
    "content_hash": "sha256:91ab..."
  }
}
```

## Backend Rules

```text
Never trust client-provided org_id without checking membership.
Every project action must verify project_members.
Every context write must create a context_events row.
Every content change must create a context_versions row.
Duplicate content_hash for same project/title should not create a new version.
Resolved contexts stay queryable but are excluded from active relevant results by default.
Duplicate org/project slugs must return 409 CONFLICT, not 500 INTERNAL_ERROR.
```

## Verified Smoke Status

Verified on 2026-05-19 against localhost:

```text
GET /health                                  200
GET /orgs without bearer                     401 AUTH_REQUIRED
GET /me                                      200
GET /orgs                                    200
GET /projects                                200
GET /orgs/:org_id/members                    200
GET /projects/:project_id/members            200
POST /orgs                                   200
POST /projects                               200
POST /contexts                               200
GET /contexts/relevant                       200
GET /contexts/:context_id                    200
POST /contexts/:context_id/read              200
POST /contexts/:context_id/reference         200
POST /contexts/:context_id/resolve           200
POST /orgs duplicate slug                     409 CONFLICT
POST /projects duplicate slug                 409 CONFLICT
```

Latest live duplicate-slug verification:

```text
POST /orgs duplicate      409 CONFLICT
POST /projects create     200
POST /projects duplicate  409 CONFLICT
user_id                   affeda20-1095-4e6c-9506-17bd7c0720dd
```

The duplicate-slug fix belongs in the backend error classification layer. SDK and MCP preserve and expose the backend's structured error.

## Why Backend API Exists

Supabase remains the database and auth layer, but the backend API gives one place for:

```text
business rules
receipt generation
versioning behavior
audit events
future controlled changes
```
