# Supabase Connection Check Sprint

## Scope

Add a minimal Supabase connection check and document the environment placeholders future implementation should use.

## Assumptions

- Supabase credentials are stored in `.env`.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are enough to validate the public Supabase connection.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and should not be used by frontend, SDK, MCP, or CLI client code.
- The repository does not yet have an application package, so the check should be a standalone Node script.

## Architectural Decisions

- Validate connectivity with Supabase REST using built-in `fetch` instead of introducing `@supabase/supabase-js` before package structure exists.
- Keep the sample read-only and side-effect free.
- Never print secret values during verification.

## Tasks

1. Add a standalone Supabase connection check script.
2. Add `.env.example` with Supabase placeholders.
3. Document the required Supabase environment placeholders in context docs.
4. Run the check against the current `.env`.
5. Review diffs and side effects.

## Risks

- The anon key can be valid while project tables are not created yet.
- Network availability can make the check fail even when credentials are correct.
- Service-role misuse could leak admin privileges if copied into client-side code.

## Verification Strategy

- Confirm `.env` contains the expected keys without printing values.
- Run the Supabase connection check.
- Confirm docs distinguish browser-safe public keys from server-only secrets.
