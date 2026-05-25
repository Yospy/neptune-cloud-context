# Real Supabase Backend Hardening Sprint

## Scope

Make the backend functional against real Supabase, not only fake clients. Add minimal bootstrap APIs, transactional context lifecycle writes, missing reference/resolve endpoints, and gated integration tests that sign in with a real Supabase Auth test user.

## Assumptions

- Supabase migration application is intentional and manual against the target project.
- Integration tests use a pre-existing Supabase Auth user with email/password.
- `SUPABASE_SERVICE_ROLE_KEY` remains backend-only.
- SDK, MCP, and CLI stay out of scope until real backend verification passes.

## Architectural Decisions

- Keep Hono as the HTTP API layer.
- Keep Supabase Auth JWT verification on every protected route.
- Use service-role backend access only inside the backend process.
- Move multi-row write lifecycles into Postgres RPC functions so create/update/version/event/reference/resolve operations are atomic.
- Keep route handlers thin: validate request, use authenticated user, call repository, return deterministic response.

## Tasks

1. Add shared schemas/types/errors for orgs, projects, references, and resolve.
2. Add minimal org/project bootstrap routes.
3. Add context reference and resolve routes.
4. Extend Supabase migration with `context_references`, indexes, RLS, and transactional RPC functions.
5. Refactor repository writes to call RPC functions for atomic mutations.
6. Add unit tests for new route/repository behavior and deterministic errors.
7. Add gated real Supabase integration tests using email/password sign-in.
8. Run typecheck, unit tests, and backend build.
9. Review diff, secret handling, RLS assumptions, and manual verification steps.

## Risks

- RPC return JSON can drift from TypeScript response shapes.
- Security-definer RPC functions can weaken isolation if they do not explicitly check actor membership.
- Integration tests can mutate a real Supabase project if pointed at shared credentials.
- Existing applied migrations may require careful manual SQL execution if this migration file changes after application.

## Verification Strategy

- Unit tests cover request validation, auth boundaries, deterministic errors, route wiring, and repository RPC calls.
- Integration tests run only with `NEPTUNE_INTEGRATION_TESTS=true`.
- Integration tests sign in through Supabase Auth using `NEPTUNE_TEST_EMAIL` and `NEPTUNE_TEST_PASSWORD`.
- Manual verification uses curl against the local backend with a real bearer token.
- Confirm logs redact secrets and do not print bearer tokens, service role keys, or request bodies.
