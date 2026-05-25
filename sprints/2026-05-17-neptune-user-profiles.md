# Neptune User Profiles Sprint

## Scope

Add first-class product user profiles backed by Supabase Auth, sync authenticated users on backend requests, expose current-user and membership visibility APIs, and wire CLI commands for testing the full login-to-membership flow.

## Assumptions

- Supabase `auth.users` remains the identity source of truth.
- `public.user_profiles` is the product-facing user table.
- GitHub OAuth metadata can have missing email/name/avatar fields.
- Backend service role is the writer for profile sync; direct client writes are not supported.
- Invite acceptance and role mutation remain out of scope.

## Architectural Decisions

- Keep existing `auth.users` foreign keys and add profile foreign keys for product joins.
- Use a Supabase `auth.users` trigger for first-login/backfill correctness.
- Use backend request-time upsert to refresh `last_seen_at` and latest metadata.
- Expose `GET /me`, `GET /orgs/:org_id/members`, and `GET /projects/:project_id/members`.
- Add CLI read commands only: `me`, `org members`, and `project members`.

## Step-by-Step Tasks

1. Add user profile shared response types.
2. Add `user_profiles` migration, trigger, backfill, indexes, RLS, grants, and profile FKs.
3. Extend authenticated user metadata extraction.
4. Sync profiles after auth on protected requests.
5. Add repository methods for profile upsert, `/me`, org members, and project members.
6. Add backend routes.
7. Add CLI API helpers and commands.
8. Add unit tests for auth metadata, sync calls, membership visibility, and CLI output.
9. Run typecheck, tests, build, and review side effects.

## Risks

- Existing Supabase users may lack email, so email must remain nullable.
- Existing data can block new FKs if profile backfill is incomplete.
- Profile sync must not run for unauthenticated routes.
- Trigger failures can block future signups, so the trigger function must be minimal and defensive.

## Verification Strategy

- Run backend/shared/CLI unit tests.
- Run full workspace typecheck, tests, and build.
- Apply migration to Supabase after code verification.
- Live smoke test login, `/me`, org/project create, context lifecycle, and member listing.
