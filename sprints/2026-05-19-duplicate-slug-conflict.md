# Duplicate Slug Conflict Sprint

## Scope

Fix duplicate org/project slug errors so they are classified as conflicts instead of internal backend failures.

## Assumptions

- Duplicate slugs are invalid but expected user input, not server failures.
- Backend owns API error semantics.
- SDK and MCP should propagate backend error codes without remapping.
- The running backend may need a restart before live HTTP reflects the code change.

## Architectural Decisions

- Add shared `CONFLICT` error code.
- Map `CONFLICT` to HTTP 409 in backend.
- Detect Postgres unique-violation code `23505` in backend repository error handling.
- Keep SDK and MCP behavior as pass-through propagation.

## Step-by-Step Tasks

1. Add shared `CONFLICT` error code and backend status mapping.
2. Map DB unique violations to `CONFLICT` in repository error handling.
3. Add backend repository/app tests for duplicate conflict behavior.
4. Add SDK parsing test for backend `CONFLICT`.
5. Add MCP error propagation test for SDK `CONFLICT`.
6. Run typecheck, tests, build, and targeted regression.
7. Document results and live-backend restart note.

## Risks

- Existing live backend process may still run old code until restarted.
- Supabase unique errors can appear by SQLSTATE code `23505` or message text depending on client path.

## Verification Strategy

- Targeted backend tests.
- Targeted SDK tests.
- Targeted MCP tests.
- Full workspace typecheck, test, and build.

## Verification Results

Verified on 2026-05-19:

```text
backend targeted tests: passed
  repository duplicate org/project -> CONFLICT 409
  app duplicate org/project -> HTTP 409

SDK targeted tests: passed
  backend CONFLICT response preserved as NeptuneSdkError code=CONFLICT status=409

MCP targeted tests: passed
  SDK CONFLICT propagated as MCP isError structuredContent

corepack pnpm typecheck: passed
corepack pnpm test: passed
corepack pnpm build: passed
```

Full test counts:

```text
shared: 6 passed
backend: 38 passed, 1 gated integration skipped
sdk: 24 passed
mcp: 8 passed
cli: 18 passed
```

Review Notes

```text
Fix is at backend classification boundary.
SDK and MCP remain pass-through.
No MCP tool mapping changed.
No database schema changed.
The already-running backend process must be restarted before live duplicate calls return 409 instead of the old 500.
```

Live Backend Verification

```text
Existing backend on 8787 was healthy but still running old code:
  duplicate org/project through MCP returned INTERNAL_ERROR 500

Started rebuilt backend on 8788 without disturbing 8787:
  health: 200 OK
  duplicate org through MCP: CONFLICT 409
  duplicate project through MCP: CONFLICT 409

Live records created on 8788:
  org_id: e35c541d-6743-485e-a0ab-ddbdec9266be
  org_slug: mcp-conflict-fixed-20260519054525
  project_id: 9588d8b9-9e8c-4bca-959c-897c34f037a5
  project_slug: project-20260519054525

Temporary backend on 8788 was stopped after verification.
```
