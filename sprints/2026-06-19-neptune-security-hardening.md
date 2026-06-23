# Neptune Security Hardening Sprint

## Scope

Add targeted security hardening for Neptune context isolation, publisher traceability, bounded payloads, backend rate limits, and CI secret scanning.

This sprint starts with the highest-priority slice: cross-org/project authorization regression tests for context access and lifecycle operations.

## Assumptions

- Project isolation remains the core invariant: a user without `project_members` access must not read or mutate that project's context.
- The backend stays the server-side authority; MCP and SDK continue to route through backend APIs.
- Supabase RLS is a backstop, not the only control.
- This first slice should be test-only unless the regression tests expose a real authorization gap.

## Architectural Decisions

- Add deterministic unit regression tests around `SupabaseContextRepository` because that is where direct backend read authorization is enforced.
- Keep RPC-backed write tests focused on deterministic `PROJECT_ACCESS_DENIED` mapping because the database RPC functions already perform the membership check.
- Do not expand the MCP surface in this slice; `resolve_context` is not currently exposed as an MCP tool.
- Keep fixtures small: one authorized project, one foreign project, and an existing unauthorized user.

## Tasks

1. Add second org/project/context fixtures for cross-project authorization tests.
2. Add repository regression tests for denied `listRelevantContext`, `getContext`, and `markContextRead`.
3. Add RPC error-mapping regression tests for denied `createContext`, `markContextReferenced`, and `resolveContext`.
4. Run focused backend tests.
5. Review diff, side effects, and alignment with the isolation invariant.

Later slices:

1. Expose `created_by_user` and `updated_by_user` in context responses and receipts.
2. Add hard payload limits in shared/MCP schemas and database constraints where appropriate.
3. Add backend rate limits for protected routes and context endpoints.
4. Add CI secret scanning.

Publisher identity slice tasks:

1. Add `created_by_user` and `updated_by_user` to shared context and receipt types.
2. Enrich backend context summaries, full records, and upload receipts from `user_profiles`.
3. Derive `updated_by_user` from the current `context_versions.created_by` row, falling back to the context creator only for version 1 rows without a version record.
4. Update SDK receipt formatting to show publisher/updater email or display identity.
5. Update relevant context docs and run automated plus live verification.

## Risks

- Fake Supabase tests can accidentally prove only fixture behavior, not RPC behavior.
- RPC write authorization is enforced in SQL, so unit tests should assert backend error mapping and avoid pretending to execute SQL policy.
- Adding `resolve_context` to MCP is a product-surface decision and should not be smuggled into authorization test work.

## Verification Strategy

- Run `corepack pnpm --filter @neptune/backend test`.
- Confirm unauthorized users receive `PROJECT_ACCESS_DENIED` for foreign project/context access.
- Confirm authorized project behavior remains covered by existing tests.
- Review changed files for minimality, secret safety, and no production behavior drift.

## Verification Results

Authorization regression slice:

- `corepack pnpm --filter @neptune/backend exec vitest run test/repository.test.ts` passed: 25 tests.
- `corepack pnpm --filter neptune-context-mcp exec vitest run test/tools.test.ts` passed: 10 tests.
- `corepack pnpm --filter @neptune/backend test` passed: 43 tests, 1 gated integration skipped.
- `corepack pnpm --filter neptune-context-mcp test` passed: 10 tests.
- `corepack pnpm --filter @neptune/backend typecheck` passed.
- `corepack pnpm --filter neptune-context-mcp typecheck` passed.
- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed: 119 tests, 1 gated integration skipped.
- `corepack pnpm build` passed.
- `git diff --check` passed.

Live backend probe against `http://127.0.0.1:8787`:

- `GET /health` returned 200.
- `GET /contexts/relevant` without bearer auth returned 401 `AUTH_REQUIRED`.
- Authenticated `GET /me` returned 200, request id `68dd121e-cb54-4e97-8979-d10b5ad2a844`.
- Authenticated `GET /projects` returned 200, request id `be68a979-23e8-4fd0-900e-04ced2618034`.
- Authenticated foreign-project probe returned 403 `PROJECT_ACCESS_DENIED`, request id `f0f77c94-2ba3-4f18-82cd-e9285f0adfe6`.

Publisher identity slice:

- Added `created_by_user` and `updated_by_user` to `UploadReceipt`, `ContextSummary`, and `ContextRecord`.
- Backend enriches identity from `user_profiles`; `updated_by_user` is derived from the current `context_versions.created_by` row, with fallback only for version 1 rows without a version record.
- SDK receipt formatting now prints `Published by` and `Updated by`.
- Reviewed worker subagent implementation. It added a durable `contexts.updated_by` migration, but this slice kept the smaller no-migration approach because `context_versions.created_by` already covers content-update attribution.

Publisher identity verification:

- `corepack pnpm --filter @neptune/backend exec vitest run test/repository.test.ts test/app.test.ts` passed: 40 tests.
- `corepack pnpm --filter neptune-context exec vitest run test/receipts.test.ts` passed: 1 test.
- `corepack pnpm --filter neptune-context-mcp exec vitest run test/tools.test.ts` passed: 10 tests.
- `corepack pnpm --filter @neptune/backend test` passed: 45 tests, 1 gated integration skipped.
- `corepack pnpm --filter neptune-context test` passed: 25 tests.
- `corepack pnpm --filter neptune-context-mcp test` passed: 10 tests.
- `corepack pnpm --filter neptune-context-shared test` passed: 8 tests.
- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed: 121 tests, 1 gated integration skipped.
- `corepack pnpm build` passed.
- Live `GET /contexts/relevant` returned identity fields, request ids `3d090260-59d6-44eb-9814-79e3088dfff9` and `62d8bb66-71a9-4d70-ae50-c00684f487db`.
- Live `GET /contexts/:id` returned identity fields, request id `1c0e9a49-e2ee-4ccd-8ef9-0e5ac221d116`.
- Live unchanged `POST /contexts` receipt returned `changed: false` with identity fields, request id `a1aaf4f1-a501-4889-98b8-8cf490ef3996`.

Second live verification run:

- Direct probe: `GET /projects` returned 200, request id `a4e4c2df-1262-4039-b298-9ad89274b65f`.
- Direct probe: `GET /contexts/relevant` returned identity fields, request ids `50796ac0-103b-4722-a80e-448cba5db9d9` and `7480e90a-add2-4e64-9e33-39438a7b12af`.
- Direct probe: `GET /contexts/:id` returned identity fields, request id `6f0e54ee-b1ba-4af8-b863-5011fd43d5fe`.
- Direct probe: unchanged `POST /contexts` returned `changed: false` with identity fields, request id `b52adabc-e3d4-4501-af6e-00190dfe595f`.
- Independent subagent probe confirmed list/get/receipt identity fields and unchanged receipt behavior. Key request ids: `GET /projects` `b232b9a8-66a6-4b80-ae16-f81d28c58404`, `GET /contexts/:id` `9e5f0b0f-5538-40f9-8eb9-09e4b372aa6c`, `POST /contexts` `3f967e53-b072-4a3b-8e4c-96392c630194`.

Payload limits slice tasks:

1. Add shared payload limit constants for context creation.
2. Enforce limits in the shared/backend `createContextRequestSchema`.
3. Reuse the same constants in MCP `create_context` input validation.
4. Add regression tests for oversized markdown, oversized arrays, and oversized array items.
5. Verify locally; run an authenticated live backend probe only when a safe local session is already available.

Payload limits slice:

- Added shared `contextPayloadLimits` and enforced create-context bounds in the shared/backend request schema.
- Reused the same constants in MCP `create_context` validation.
- Added shared and MCP regression coverage for oversized `summary`, `content_md`, metadata array counts, metadata array items, `target_workstreams`, and `inference_notes`.
- Backend route validation rejects oversized context uploads before repository writes.

Payload limits verification:

- `corepack pnpm --filter neptune-context-shared test` passed: 20 tests.
- `corepack pnpm --filter neptune-context-mcp test` passed: 22 tests.
- `corepack pnpm --filter @neptune/backend exec vitest run test/app.test.ts` passed: 15 tests.
- `corepack pnpm --filter neptune-context-shared typecheck` passed.
- `corepack pnpm --filter neptune-context-mcp typecheck` passed.
- `corepack pnpm --filter @neptune/backend typecheck` passed.
- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed: 146 tests, 1 gated integration skipped.
- `corepack pnpm build` passed.
- `git diff --check` passed.
- Existing server on `127.0.0.1:8787` returned `404 PROJECT_NOT_FOUND` for an oversized payload probe, request id `3af98e61-2943-42df-bb43-0b358dd795d4`, indicating that process was stale and had not loaded the new validation.
- Temporary current-build backend on `127.0.0.1:8788` returned `400 VALIDATION_FAILED` for oversized `content_md`, request id `e04ce5e2-a111-44f2-a451-a5c73ac40aa6`.
- Temporary current-build backend on `127.0.0.1:8788` returned `400 VALIDATION_FAILED` for oversized `tags`, request id `29c8c7a1-0e58-4adc-a369-8b66fd645cd1`.

Backend rate limits slice tasks:

1. Add the `RATE_LIMITED` error contract and backend 429 mapping.
2. Add in-process per-user fixed-window limits after auth for protected routes.
3. Add stricter per-user limits for `POST /contexts`, `GET /contexts/relevant`, and `GET /contexts/:context_id`.
4. Add deterministic backend regression tests with injected limits/time.
5. Run focused backend verification; run live backend probe only when a current local server/session is available.

Backend rate limits slice decisions:

- Keep rate limits in-process for V1; no Redis, database writes, or distributed coordination.
- Key buckets by authenticated user id and rate-limit rule name.
- Apply a pre-auth protected-route limit before bearer token verification to stop invalid-token loops from repeatedly calling Supabase Auth.
- Keep post-auth protected-route and context endpoint limits keyed by authenticated user id.
- Do not add payload scanning, secret scanning, or auth behavior changes in this slice.

Backend rate limits slice:

- Added `RATE_LIMITED` to the shared/backend/SDK error contract and mapped it to HTTP 429.
- Added per-user in-process fixed-window backend limits:
  - all auth-protected routes: 300 requests per 60 seconds
  - `POST /contexts`: 30 requests per 60 seconds
  - `GET /contexts/relevant`: 120 requests per 60 seconds
  - `GET /contexts/:context_id`: 120 requests per 60 seconds
- Added `Retry-After` response headers and deterministic error details for exceeded limits.
- Added focused backend tests for the general protected bucket, strict context-create bucket, strict relevant-context bucket, and strict get-context bucket.
- Added a per-request rule guard so duplicate exact/wildcard Hono middleware registrations do not double-count one request.

Backend rate limits verification:

- `corepack pnpm --filter @neptune/backend exec vitest run test/app.test.ts` passed: 19 tests.
- `corepack pnpm --filter @neptune/backend typecheck` passed.
- `corepack pnpm --filter @neptune/backend test` passed: 50 tests, 1 gated integration skipped.
- `corepack pnpm --filter neptune-context-shared test` passed: 20 tests.
- `corepack pnpm --filter neptune-context test` passed: 26 tests.
- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed: 151 tests, 1 gated integration skipped.
- `corepack pnpm build` passed.
- `git diff --check` passed.
- Temporary current-build backend was started on `127.0.0.1:8788` for live probing and then stopped.
- Authenticated live rate-limit probing was blocked because the local Neptune access token was expired by config.
- Probe result: 31 `POST /contexts` attempts returned `401 AUTH_REQUIRED`; first request id `b7929f00-e239-4fe9-a912-92718b1892a6`, 30th request id `a420bd50-cc67-4814-b24a-1999c6ea0173`, 31st request id `6151e2de-d514-4fe3-9542-6935215cc5d4`.
- A valid refreshed login token is required for a live `429 RATE_LIMITED` probe; deterministic in-process Hono tests verified the 429 behavior.

Backend pre-auth rate-limit follow-up:

- Confirmed a review finding: invalid bearer-token requests reached Supabase Auth before any existing rate limit could apply.
- Added a pre-auth protected-route bucket before `requireAuth`.
- The pre-auth bucket is keyed from `X-Forwarded-For`, `X-Real-IP`, `CF-Connecting-IP`, or an `unknown` direct/local fallback.
- Kept the existing post-auth per-user protected-route and endpoint-specific buckets.
- Added regression tests proving repeated invalid bearer attempts return `429 RATE_LIMITED` before another `auth.getUser()` call.

Backend pre-auth rate-limit verification:

- In-process probe before the fix confirmed repeated invalid bearer requests returned `401` and called `auth.getUser()` twice.
- `corepack pnpm --filter @neptune/backend exec vitest run test/app.test.ts` passed: 21 tests.
- `corepack pnpm --filter @neptune/backend typecheck` passed.
- `corepack pnpm --filter @neptune/backend test` passed: 52 tests, 1 gated integration skipped.
- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed: 155 tests, 1 gated integration skipped.
- `corepack pnpm build` passed.
- Live probe against existing `127.0.0.1:8787` returned `401 AUTH_REQUIRED` for request 301, so that running process had not loaded the new build.
- Temporary current-build backend on `127.0.0.1:8788` returned `429 RATE_LIMITED` with `Retry-After: 60` for request 301 using a dedicated `X-Forwarded-For` client identity.

Secret scanning CI slice tasks:

1. Add a GitHub Actions workflow that runs Gitleaks on pull requests and pushes to `main`.
2. Keep default Gitleaks detection enabled.
3. Add Neptune-specific rules for `SUPABASE_SERVICE_ROLE_KEY`, Supabase JWTs, committed `.env` files, and committed `.neptune/config.json` auth tokens.
4. Update security documentation.
5. Validate the TOML/workflow syntax, simulate the custom scan locally without printing secret values, and review the diff.

Secret scanning CI slice decisions:

- Use Gitleaks because it is a standard CI secret scanner and can run before merge without adding backend runtime dependencies.
- Keep the configuration at the repo root as `.gitleaks.toml` so the action and local Gitleaks runs use the same rules.
- Do not add allowlists in this slice; the custom rules are narrow enough to avoid the existing placeholder docs and test tokens.
- Do not add live backend probing for this slice because secret scanning protects repository changes, not HTTP runtime behavior.

Secret scanning CI slice:

- Added `.github/workflows/secret-scan.yml` for pull requests, pushes to `main`, and manual dispatch.
- The workflow uses `actions/checkout@v6` with `fetch-depth: 0` and `gitleaks/gitleaks-action@v3`.
- Kept workflow permissions read-only and disabled PR comments.
- Added `.gitleaks.toml` with default Gitleaks rules plus Neptune-specific checks for:
  - `SUPABASE_SERVICE_ROLE_KEY` assignments with real-looking service-role key values.
  - Supabase JWT-shaped tokens.
  - Runtime `.env` files with assignments, excluding `.env.example`.
  - `.neptune/config.json` and `.agentctx/config.json` auth token leaks.
- Updated `SECURITY.md` to document CI secret scanning coverage.

Secret scanning CI verification:

- `.gitleaks.toml` parsed with Python `tomllib`: 5 custom rules.
- `.github/workflows/secret-scan.yml` parsed with Ruby YAML.
- Local custom-rule simulation scanned 141 tracked and unignored workspace files and found 0 findings.
- Synthetic custom-rule checks confirmed detection for service-role key assignments, JWT-shaped tokens, local config tokens, and runtime `.env` files, while ignoring `.env.example`.
- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed: 151 tests, 1 gated integration skipped.
- `corepack pnpm build` passed.
- `git diff --check` passed.
- Live backend probing was not applicable because this slice is a CI/repository gate, not runtime HTTP behavior.
