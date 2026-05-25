# Context Metadata

## Purpose

Metadata lets agents find the right markdown without hallucinating.

The agent should filter by metadata first, then read markdown.

The SDK owns deterministic V1 inference through `inferContextMetadata`. MCP accepts explicit metadata through `create_context`.

## Required Metadata

```text
id
org_id
project_id
title
summary
content_md
content_hash
source_workstream
target_workstreams
domain
code_areas
context_type
status
priority
created_by
created_at
updated_at
version
```

## Recommended Metadata

```text
tags
repo_paths
related_files
git_branch
git_commit
valid_from
expires_at
confidence_score
inference_notes
resolved_at
superseded_by
```

## Inference Rules

Current deterministic V1 behavior:

```text
title: first H1, else first non-empty line, else filename, max 160 chars
summary: first meaningful paragraph stripped of markdown, max 500 chars
source_workstream: hint/path keywords, else project binding default, else general
target_workstreams: hint/markdown keywords, else sensible counterpart, else general
domain: keyword map such as auth/api/database/frontend/infra/testing, else general
context_type: keyword map such as contract/API/UI/migration/bug/decision/setup, else general_context
project index convention: title `Project Index` or explicit `project_index` routes as project_index/general/high
code_areas/tags/repo_paths: inferred from paths, headings, and repeated technical keywords
confidence_score: deterministic score from title/summary/path/domain/type/workstream evidence
inference_notes: explicit reasons and low-confidence warnings
```

## Workstream Enum

```text
frontend
backend
mobile
infra
design
qa
data
docs
general
```

## Context Type Enum

```text
api_contract
ui_contract
implementation_note
decision
migration
bug_context
setup_note
requirement
general_context
project_index
```

## Project Index Convention

```text
title = Project Index
context_type = project_index
domain = general
source_workstream = general
target_workstreams = [general]
priority = high
```

The index is project-scoped by `project_id` and contains pointers to context records, not duplicate context content.

## Status Enum

```text
draft
active
resolved
superseded
archived
```

## Priority Enum

```text
low
normal
high
blocking
```

## Upload Receipt

Every upload must return a deterministic receipt.

```text
Context uploaded

ID: ctx_8f31
Org: acme
Project: checkout
Title: Auth UI Login Contract
From: frontend
To: backend
Domain: auth
Code areas: login, session
Type: ui_contract
Status: active
Version: 1
Created at: 2026-05-16T12:04:22Z
Hash: sha256:91ab...
```

## Duplicate Upload Behavior

Same content hash:

```text
No change detected.
Existing context: ctx_8f31
Version: 1
Hash: sha256:91ab...
```

Changed content:

```text
New version created.
Existing context: ctx_8f31
Version: 2
Updated at: 2026-05-16T12:09:10Z
Hash: sha256:72cd...
```

## Example Metadata

```json
{
  "title": "Auth UI Login Contract",
  "summary": "Frontend login form sends email/password and expects access and refresh tokens.",
  "source_workstream": "frontend",
  "target_workstreams": ["backend"],
  "domain": "auth",
  "code_areas": ["login", "session"],
  "context_type": "ui_contract",
  "status": "active",
  "priority": "normal",
  "repo_paths": ["src/features/auth/LoginForm.tsx"],
  "tags": ["login", "jwt", "refresh-token"],
  "created_at": "2026-05-16T12:00:00Z",
  "updated_at": "2026-05-16T12:00:00Z",
  "version": 1,
  "confidence_score": 0.88,
  "inference_notes": "Inferred frontend to backend because markdown describes request body and expected backend response."
}
```

## Fetch Rules

For "latest backend auth context":

```text
project_id = current project
target_workstreams includes backend
domain = auth
status = active
order by updated_at desc
```

For "new context for frontend":

```text
project_id = current project
target_workstreams includes frontend
status = active
exclude contexts already read by current user/agent
order by updated_at desc
```
