# Neptune V0 Backend Sprint

## Scope

Implement the first reliable Neptune backend slice: Supabase schema, shared TypeScript contracts, and a Hono API for the context lifecycle.

## Assumptions

- Supabase is already connected through `.env`.
- Migrations are written but not applied automatically.
- Real Supabase bearer JWT auth is required for protected routes.
- The service role key is backend-only.
- SDK, MCP, CLI setup, metadata inference, org invites, and UI remain out of scope.

## Architectural Decisions

- Use Hono with `@hono/node-server` for the HTTP API.
- Use `@supabase/supabase-js` v2 for Auth verification and database access.
- Put public API types, enums, Zod schemas, and error codes in `packages/shared`.
- Keep business rules in backend services/repositories, not route handlers.
- Enforce membership in backend checks and in Supabase RLS policies.
- Use `sha256:<hex>` content hashes for deterministic upload behavior.

## Tasks

1. Scaffold TypeScript workspace and package configuration.
2. Implement shared contracts, schemas, and deterministic error codes.
3. Add Supabase SQL migration with tables, indexes, and RLS.
4. Implement backend env loading, hashing, receipts, auth middleware, and error handling.
5. Implement context repository for create, relevant list, get, and mark-read flows.
6. Implement Hono routes for the V0 API surface.
7. Add unit and API tests with mocked Supabase clients.
8. Run typecheck, tests, backend tests, and backend build.
9. Review diff, side effects, secret handling, and alignment with context docs.

## Risks

- Supabase query builder mocks can diverge from real client behavior.
- RLS policy mistakes can silently weaken isolation if not integration-tested after migration.
- Versioning behavior can drift if duplicate and changed-content paths are not tested.

## Verification Strategy

- Run all required local checks.
- Keep integration tests gated by `NEPTUNE_INTEGRATION_TESTS=true`.
- Confirm committed env files contain placeholders only.
- Confirm service role usage is isolated to backend Supabase client construction.
- Confirm no migrations are applied to the remote Supabase project during this sprint.
