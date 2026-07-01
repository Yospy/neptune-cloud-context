# Todo

## Active Sprint

`sprints/2026-07-01-cli-pnpm-publish-fix.md`

## Previous Sprint

`sprints/2026-07-01-scoped-neptune-cli-package.md`

## Tasks

- [x] Create CLI pnpm publish fix sprint plan.
- [x] Bump CLI package/docs to 0.1.14.
- [x] Update publish command guidance to pnpm publish.
- [x] Verify packed metadata rewrites workspace dependencies.
- [x] Run focused and workspace verification.
- [x] Commit, push, and open draft PR.

- [x] Create scoped Neptune CLI package sprint plan.
- [x] Rename CLI npm package to @yash_1008/neptune.
- [x] Update install and publish docs.
- [x] Run focused and workspace verification.
- [x] Review diff and publish instructions.
- [x] Commit, push, and open draft PR.

- [x] Create Neptune CLI install command sprint plan.
- [x] Rename CLI npm package to neptune.
- [x] Add neptune install alias for setup.
- [x] Update focused CLI tests.
- [x] Update install docs and package naming references.
- [x] Run focused and workspace verification.
- [x] Run subagent review.
- [x] Commit, push, and open draft PR.

- [x] Create author note sprint plan.
- [x] Add Supabase author-note schema, RPC, and search migration.
- [x] Update shared author-note contracts and errors.
- [x] Wire backend author-note route, repository, and tests.
- [x] Update SDK author-note API and receipt formatting.
- [x] Update MCP author-note tools and tests.
- [x] Update context docs and package versions.
- [x] Run focused and workspace verification.
- [x] Review diff, side effects, and publish commands.

- [x] Create smart retrieval partial-term ranking sprint plan.
- [x] Replace smart retrieval RPC with partial-term ranking.
- [x] Add backend regression coverage.
- [x] Update context docs.
- [x] Run focused and workspace verification.
- [x] Review diff, side effects, and deployment notes.

- [x] Create project checkout binding sprint plan.
- [x] Add CLI project checkout command.
- [x] Add focused checkout tests.
- [x] Update CLI docs/help.
- [x] Run verification and independent subagent review.
- [x] Review diff, side effects, and publish commands.

- [x] Create agent intent retrieval sprint plan.
- [x] Extend shared retrieval contracts.
- [x] Add database retrieval RPC and indexes.
- [x] Wire backend repository to ranked retrieval.
- [x] Update MCP tool schema and docs.
- [x] Add query, updated_after, unread, and match_reason tests.
- [x] Run focused and workspace verification.
- [x] Run independent subagent verification.
- [x] Review diff, side effects, and publish commands.

- [x] Create smart context retrieval sprint plan.
- [x] Add shared smart retrieval schemas and types.
- [x] Add project-wide smart retrieval database RPC.
- [x] Wire backend retrieve route and repository method.
- [x] Add SDK retrieveContext wrapper.
- [x] Add MCP retrieve_context tool.
- [x] Update context docs.
- [x] Add focused tests.
- [x] Run verification and independent subagent review.
- [x] Review diff, side effects, and publish/deploy commands.

- [x] Create CLI org/project binding sprint plan.
- [x] Add SDK default org and project unbind helpers.
- [x] Add CLI org/project binding commands.
- [x] Update CLI setup docs.
- [x] Add focused SDK/CLI tests.
- [x] Run typecheck, tests, and build.
- [x] Run independent subagent review.
- [x] Review diff, side effects, and publish commands.

- [x] Create project delete/logout sprint plan.
- [x] Add shared delete response type.
- [x] Add backend delete route and repository authorization.
- [x] Add SDK deleteProject wrapper.
- [x] Add CLI project delete command and auth logout alias.
- [x] Update docs and package versions.
- [x] Add focused tests.
- [x] Run verification.
- [x] Review diff, side effects, and publish/deploy commands.

- [x] Create Neptune security hardening sprint plan.
- [x] Add cross-org/project authorization fixtures.
- [x] Add context authorization regression tests.
- [x] Run focused backend security test verification.
- [x] Review diff, side effects, and isolation invariant alignment.
- [x] Add publisher identity response contract.
- [x] Enrich context summaries, records, and receipts with publisher/updater profiles.
- [x] Update receipt formatting and docs.
- [x] Run publisher identity verification and live probe.
- [x] Add payload limit constants and shared/backend validation.
- [x] Mirror payload limits in MCP tool validation.
- [x] Add payload limit regression tests.
- [x] Run payload limit verification; document live probe status.
- [x] Add backend rate-limit error contract.
- [x] Add protected-route and context-route rate-limit middleware.
- [x] Add rate-limit regression tests.
- [x] Run rate-limit verification; document live probe status.
- [x] Add pre-auth protected-route rate limit for invalid token loops.
- [x] Run pre-auth rate-limit verification and live probe.
- [x] Add CI secret scanning workflow and Neptune-specific rules.
- [x] Run local secret-scan simulation and workflow/config validation.
- [x] Review secret scanning diff and document results.

- [x] Create CLI name create commands sprint plan.
- [x] Update org/project create command parsing.
- [x] Add focused CLI tests.
- [x] Run CLI test verification.
- [x] Review whether SDK republish is needed.

- [x] Create Neptune edge regression sprint plan.
- [x] Run automated workspace verification.
- [x] Run local CLI/setup/doctor failure-mode checks.
- [x] Run live backend and MCP edge checks.
- [x] Document passed, failed, blocked, and untestable cases.

- [x] Create Neptune first-user V1 completion sprint plan.
- [x] Add `neptune setup` implementation.
- [x] Add `neptune doctor` implementation.
- [x] Add targeted setup and doctor CLI tests.
- [x] Run install, typecheck, tests, build, pack, and clean-install smoke.
- [x] Document final verification and remaining publish/E2E steps.

- [x] Create Neptune install foundation sprint plan.
- [x] Rename CLI package metadata to `neptune-context-cli`.
- [x] Add `neptune mcp install` for Codex and Claude.
- [x] Add targeted CLI install tests.
- [x] Refresh workspace package state.
- [x] Run typecheck, tests, build, pack, and clean-install smoke.
- [x] Document verification results.

- [x] Create duplicate slug conflict sprint plan.
- [x] Add shared/backend CONFLICT classification.
- [x] Add backend, SDK, and MCP regression tests.
- [x] Run typecheck, tests, build, and targeted duplicate checks.
- [x] Document verification results.

- [x] Create Neptune MCP foundation sprint plan.
- [x] Add SDK deterministic metadata inference.
- [x] Add MCP package scaffold.
- [x] Add MCP SDK-backed tools.
- [x] Add SDK and MCP tests.
- [x] Run workspace regression.
- [x] Run live backend health and MCP stdio E2E.
- [x] Review implementation and document results.
- [x] Add root `sample.py` OpenAI chat bridge for existing stdio MCP.
- [x] Smoke-test `sample.py` against live backend with a read-only prompt.
- [x] Run MCP-only edge-case pass against live backend.

- [x] Create Neptune context package rename sprint plan.
- [ ] Rename public package metadata.
- [ ] Update imports, dependencies, scripts, and path aliases.
- [ ] Refresh package state.
- [ ] Run typecheck, tests, and build.
- [ ] Pack and clean-install renamed packages.
- [ ] Document package rename verification.

- [x] Create SDK backend edge-case verification sprint plan.
- [x] Run SDK unit tests and SDK build.
- [x] Confirm local backend health.
- [x] Run live SDK-only auth edge cases.
- [x] Run live SDK-only validation and access edge cases.
- [x] Run live SDK-only network, duplicate, and resolved-context edge cases.
- [x] Document verification results.

- [x] Create V0 backend sprint plan.
- [x] Scaffold TypeScript workspace and package configuration.
- [x] Implement shared contracts and schemas.
- [x] Add Supabase schema/RLS migration.
- [x] Implement backend env, auth, errors, hashing, and receipts.
- [x] Implement context repository.
- [x] Implement Hono API routes.
- [x] Add backend/shared tests.
- [x] Run required verification commands.
- [x] Review diff, side effects, and secret handling.

## Logging Sprint Tasks

- [x] Create backend logging sprint plan.
- [x] Add logging dependencies and env placeholders.
- [x] Add Pino logger with redaction.
- [x] Add low-noise request logging middleware.
- [x] Add periodic backend health logging.
- [x] Wire logger into backend startup.
- [x] Add logging regression tests.
- [x] Run verification commands.
- [x] Manually verify logs with curl.

## Real Supabase Backend Hardening Tasks

- [x] Create real Supabase hardening sprint plan.
- [x] Add shared org/project/reference/resolve contracts.
- [x] Add minimal org/project bootstrap routes.
- [x] Add context reference and resolve routes.
- [x] Add transactional Supabase RPC migration.
- [x] Refactor repository writes to RPCs.
- [x] Add unit tests for hardening behavior.
- [x] Add gated real Supabase integration tests.
- [x] Run verification commands.
- [x] Review diff, side effects, and secret handling.

## OSS Foundation Tasks

- [x] Create OSS foundation sprint plan.
- [x] Add root OSS files.
- [x] Add GitHub CI, Dependabot, and PR template.
- [x] Add MIT package metadata while keeping packages private.
- [x] Tighten ignore and public hygiene rules.
- [x] Run verification commands.
- [x] Review diff, side effects, and secret handling.

## OSS Foundation Verification Notes

- `corepack pnpm install --frozen-lockfile` passed.
- `corepack pnpm test` passed.
- `corepack pnpm typecheck` failed on existing backend hardening work: `SupabaseContextRepository` does not implement new `ContextRepository` methods.
- `corepack pnpm build` failed on the same existing backend hardening type mismatch.
- Public-readiness review found no real secrets in the new OSS files.

## Login Foundation Tasks

- [x] Create login foundation sprint plan.
- [x] Add CLI package metadata and TypeScript config.
- [x] Implement local token/config storage.
- [x] Implement Supabase GitHub OAuth login callback.
- [x] Implement authenticated org/project CLI commands.
- [x] Add CLI tests.
- [x] Update docs.
- [x] Run verification commands.
- [x] Review diff, side effects, and secret handling.

## Login Foundation Verification Notes

- `corepack pnpm install --offline` passed and linked the new CLI workspace package.
- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed: shared 6 tests, backend 25 tests plus 1 skipped integration, CLI 10 tests.
- `corepack pnpm build` passed.
- Manual backend smoke: `GET /health` returned 200.
- Manual backend smoke: `GET /orgs` without bearer token returned `401 AUTH_REQUIRED`.
- Manual CLI smoke with isolated `HOME`: `auth status` returned `Not logged in.` without reading user config.
- Live GitHub OAuth was not executed because it requires a browser login and Supabase redirect allow-list configuration.

## User Profiles Tasks

- [x] Create user profiles sprint plan.
- [x] Add shared user/profile contracts.
- [x] Add Supabase user profile schema, backfill, trigger, grants, and profile FKs.
- [x] Extend backend auth metadata extraction and profile sync.
- [x] Add `/me`, org member, and project member backend APIs.
- [x] Add CLI user/member commands.
- [x] Add tests.
- [x] Run verification commands.
- [x] Review diff, side effects, and secret handling.

## User Profiles Verification Notes

- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed: shared 6 tests, backend 34 tests plus 1 skipped integration, CLI 15 tests.
- `corepack pnpm build` passed.
- Supabase migration applied successfully and backfilled the existing GitHub-auth user profile.
- Live backend smoke passed for `/me`, org/project member listing, org create, project create, context create, relevant search, get, read, reference, and resolve.
- Database verification found 9 profile foreign-key constraints and successful user/profile/org/project membership joins.

## Neptune Rename Cutover Tasks

- [x] Create rename cutover sprint plan.
- [x] Add legacy local config migration.
- [x] Add legacy env var fallback.
- [x] Add DB cleanup for old RPC functions/triggers/defaults.
- [x] Add compatibility tests.
- [x] Run verification commands.
- [x] Apply and verify live Supabase rename cleanup.
- [x] Restart backend and smoke-test.

## Neptune Rename Cutover Verification Notes

- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed: shared 6 tests, backend 34 tests plus 1 skipped integration, CLI 18 tests.
- `corepack pnpm build` passed.
- Supabase migration applied successfully.
- Live DB now has 6 `neptune_*` functions, 0 old `agentctx_*` functions, and only `on_auth_user_neptune_profile_sync`.
- `context_reads.agent_name` and `context_references.agent_name` defaults are `'neptune'`.
- CLI migrated existing `~/.agentctx/config.json` into `~/.neptune/config.json`.
- Live CLI smoke passed for `me`, `orgs`, and `projects`.
- Live write-path smoke passed for org create, project create, context create, reference, and resolve.

## Context Progress Refresh Tasks

- [x] Create context progress refresh sprint plan.
- [x] Update product/backend status docs.
- [x] Update backend API docs with implemented endpoints and smoke status.
- [x] Update database schema docs with `user_profiles`, current tables, and `neptune_*` RPCs.
- [x] Update CLI setup docs with implemented commands, token storage, migration, and env fallback.
- [x] Update app flow, SDK, and MCP docs with implemented/planned boundaries.
- [x] Review `context/` for stale AgentCtx/backend claims.

## SDK Foundation Tasks

- [x] Create SDK foundation sprint plan.
- [x] Add `neptune-context` package scaffolding.
- [x] Move reusable config/env/auth-refresh/API internals into SDK.
- [x] Add SDK client methods for implemented backend endpoints.
- [x] Add repo binding helpers and receipt formatter.
- [x] Refactor CLI to consume SDK while keeping OAuth login in CLI.
- [x] Add SDK unit tests and preserve CLI regression tests.
- [x] Run verification commands.
- [x] Review API boundary, security, side effects, and remaining duplication.

## SDK Foundation Verification Notes

- `corepack pnpm install --offline` passed and registered the new SDK workspace package.
- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed: shared 6 tests, backend 34 tests plus 1 skipped integration, SDK 16 tests, CLI 18 tests.
- `corepack pnpm build` passed.
- SDK owns config/env/auth-refresh/API request logic; CLI retains browser OAuth login and command output.
- Review found no service-role usage, browser opening, or token printing in the SDK surface.

## SDK Public Packaging Readiness Tasks

- [x] Create public packaging readiness sprint plan.
- [x] Update `neptune-context-shared` public package metadata.
- [x] Update `neptune-context` public package metadata.
- [x] Add or confirm SDK tests for local default URL and env override.
- [x] Refresh workspace package state offline.
- [x] Run verification commands.
- [x] Pack shared and SDK tarballs with `pnpm pack`.
- [x] Inspect tarball contents for publish-safe file lists.
- [x] Install tarballs in a clean temporary app and verify SDK runtime behavior.
- [x] Review package readiness, local default URL, and publish order.

## SDK Public Packaging Readiness Verification Notes

- `corepack pnpm install --offline` passed.
- `corepack pnpm typecheck` passed.
- `corepack pnpm test` passed: shared 6 tests, backend 34 tests plus 1 skipped integration, SDK 18 tests, CLI 18 tests.
- `corepack pnpm build` passed.
- Public package names changed from unavailable `@neptune/*` scope to `neptune-context-shared` and `neptune-context`.
- `0.1.0` was published but SDK install failed because the tarball retained `workspace:*`.
- `0.1.1` was published with `pnpm publish`, which rewrote the SDK dependency to `neptune-context-shared@0.1.1`.
- Public install passed with `npm install neptune-context`.
- Tarballs contain `dist/`, `package.json`, and npm's automatic `LICENSE`; no `src/`, `test/`, or config files are included.
- Installed SDK runtime check passed for local default URL, bearer auth header, and dependency resolution.
- Node 18 emitted expected engine warnings; package metadata now requires Node `>=20`.
