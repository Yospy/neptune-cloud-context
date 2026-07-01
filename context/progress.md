# Progress Snapshot

Updated: 2026-07-01

## Current State

```text
Backend: running locally on http://127.0.0.1:8787
CLI: neptune-context-cli@0.1.16
SDK: neptune-context@0.1.10
Shared package: neptune-context-shared@0.1.7
MCP: neptune-context-mcp@0.1.8, stdio transport
Installer: neptune mcp install for Codex and Claude Code
Setup: npm install -g neptune-context-cli@latest starts login/org/project/repo binding/MCP setup
Doctor: neptune doctor for Node/auth/backend/binding/MCP checks
Sample bridge: sample.py using OpenAI Responses API + MCP tools
```

## Confirmed Integration

```text
OpenAI model/sample.py -> MCP stdio -> SDK -> backend HTTP -> Supabase
```

All protected backend requests use the user's stored Supabase bearer token from local Neptune config.

Verified user:

```text
user_id: affeda20-1095-4e6c-9506-17bd7c0720dd
email: yashwadgave1008@gmail.com
provider: github
```

## Completed Work

```text
backend auth/profile/org/project/context lifecycle
SDK config/session/API/binding/metadata/error helpers
deterministic SDK inferContextMetadata
MCP package with exact 6 context-work tools
OpenAI sample.py chat-style MCP tester
npm package rename from @yash_1008/neptune-sdk to neptune-context
duplicate org/project slug fix: 500 INTERNAL_ERROR -> 409 CONFLICT
CLI package restored to public metadata: neptune-context-cli@0.1.16
neptune mcp install --target codex|claude|all with --dry-run
npm install setup with prompts for first-user onboarding; internal setup commands retained for recovery
neptune doctor diagnostics for local install health
neptune org/project binding commands and project deletion
smart context retrieval through GET /contexts/retrieve and MCP retrieve_context
author-owned context notes with manual/agent-inferred source
```

## Latest Regression

```text
corepack pnpm --filter neptune-context-shared test passed, 29 tests
corepack pnpm --filter @neptune/backend test       passed, 71 tests plus 1 skipped integration
corepack pnpm --filter neptune-context test        passed, 32 tests
corepack pnpm --filter neptune-context-mcp test    passed, 27 tests
corepack pnpm --filter neptune-context-cli test     passed, 52 tests
corepack pnpm typecheck                           passed
corepack pnpm test                                passed
corepack pnpm build                               passed
pnpm publish --dry-run                           passed for CLI 0.1.16 publish metadata
local MCP stdio tools/list                        not yet rerun for author-note release
live SQL author-note migration                    applied and readback verified
```

## Latest Live Backend Edge Case

Install foundation live check confirmed:

```text
GET /health via backend 8787       200 OK
CLI auth status                    logged in as yashwadgave1008@gmail.com
CLI me                             user affeda20-1095-4e6c-9506-17bd7c0720dd, 14 orgs, 13 projects
MCP stdio listTools                5 tools after 2026-05-21 reduction
MCP require_project_binding        exposed in local tool surface
stored expired auth                refreshed to 2026-05-19T09:41:53.000Z
```

First-user V1 live regression confirmed:

```text
GET /health via backend 8787                       200 OK
CLI auth status                                    logged in as yashwadgave1008@gmail.com
CLI me                                             user affeda20-1095-4e6c-9506-17bd7c0720dd, 14 orgs, 13 projects
isolated npm-install setup with temp config/repo passed
isolated neptune doctor --target codex             passed
MCP stdio tools/list                               5 tools after 2026-05-21 reduction
MCP require/list/get/create/reference              source tests passed
duplicate org/project checks                       Resource already exists.
```

Edge regression confirmed on 2026-05-20:

```text
corepack pnpm typecheck                            passed
corepack pnpm test                                 passed
corepack pnpm build                                passed
local CLI/setup/doctor failure modes               passed
SDK duplicate org/project conflicts                passed
SDK missing context -> CONTEXT_NOT_FOUND           passed
SDK resolved-context exclusion                     passed
MCP invalid UUID protocol validation               passed
MCP missing context structured error               passed
MCP duplicate org structured CONFLICT              passed
real repo binding                                  written
real Codex MCP config                              written
real Claude MCP config                             written
doctor node/auth/backend/me/binding/config checks  passed
doctor MCP probe                                   blocked by npm 404 until MCP publish
```

Regression fix:

```text
neptune doctor now defaults to real child_process execFile for Claude config checks.
```

Publish/final install verification:

```text
neptune-context-shared@0.1.7  release target
neptune-context@0.1.10        release target
neptune-context-mcp@0.1.8     release target
neptune-context-cli@0.1.16     release target
fresh npm install             not yet rerun for author-note release
neptune --help                not yet rerun for author-note release
neptune mcp install dry-run   not yet rerun for author-note release
neptune doctor --target all   not yet rerun for author-note release
```

Runtime note:

```text
neptune-context-mcp requires Node >=20.
The local /usr/local/bin/node is Node 18.15.0 and correctly fails.
The local /opt/homebrew/bin/node is Node 23.11.0 and passes.
```

Logs confirmed:

```text
POST /orgs duplicate      409 CONFLICT
POST /projects create     200
POST /projects duplicate  409 CONFLICT
DELETE /projects admin    200
DELETE /projects nonadmin 403 PROJECT_ACCESS_DENIED
```

MCP preserves this as structured `isError` content:

```json
{
  "code": "CONFLICT",
  "message": "Resource already exists.",
  "status": 409
}
```

## Live Test Records

Recent MCP conflict retest created:

```text
org_id: 47a8a571-eca6-49c4-89d7-e9ff41282bcd
org_slug: live-setup-20260519140653
project_id: f31c6ab2-d8f2-472c-b010-9edabb9bf89f
project_slug: project-20260519140653
context_id: 217fe634-113d-4d8a-8e80-970524c75991

org_id: 7ee7418e-1521-49ac-858b-4b9651bf5e55
org_slug: mcp-conflict-retest-20260519054712
project_id: 47b4c694-a696-4bc6-8a8e-1f6ebc70854e
project_slug: project-20260519054712
```

Earlier MCP edge test created:

```text
org_id: a8cddabe-00f4-4f8c-926c-642b99ceee7d
project_id: fd245bb0-8182-4333-b39d-2926ee810634
context_id: a89dd843-3258-4b52-a000-48c2dcd50f3a
```

## Remaining Gaps

```text
add invite creation/acceptance
add role mutation/admin management
run final live Codex app MCP tool invocation
run final live Claude Code MCP tool invocation
decide later whether remote HTTP MCP transport is needed
```

## Recommended Next Step

Publish the installable packages, then run registry and app-level E2E:

```text
1. keep README and context docs aligned with published package behavior
2. run clean-machine npm install setup and neptune doctor after DB resets
3. verify Neptune MCP tools inside Codex and Claude Code
4. implement invite creation/acceptance
```
