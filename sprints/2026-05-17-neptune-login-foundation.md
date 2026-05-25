# Neptune Login Foundation Sprint

## Scope

Implement the first terminal-first login loop for Neptune so a user can authenticate with Supabase GitHub OAuth, store a local bearer session, and call existing authenticated org/project backend APIs from a CLI.

## Assumptions

- Supabase Auth remains the identity provider.
- GitHub OAuth is configured in the Supabase project.
- Backend remains the product authority for org/project/context authorization.
- CLI uses a localhost callback for browser login.
- Local token storage is acceptable for the first implementation if the config directory is private and the token file is mode `0600`.
- Invites, member management, SDK package, and MCP tools are out of scope for this sprint.

## Architectural Decisions

- Add `packages/cli` as a small Node TypeScript package with a future `neptune` binary.
- Use Supabase OAuth PKCE via `@supabase/supabase-js`.
- Use `provider: "github"` for login.
- Use a localhost callback page served by the CLI at `/auth/callback`.
- Store local auth under `~/.neptune/config.json`.
- Resolve backend API URL from `NEPTUNE_API_URL`, stored config, then `http://127.0.0.1:8787`.
- Resolve Supabase public config from `NEPTUNE_SUPABASE_URL`/`NEPTUNE_SUPABASE_ANON_KEY` first, then `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Never store or print the Supabase service role key from CLI code.

## Step-by-Step Tasks

1. Add CLI package metadata, TypeScript config, and package scripts.
2. Implement local config read/write with private directory and `0600` file permissions.
3. Implement environment resolution for API URL and Supabase public auth config.
4. Implement Supabase GitHub OAuth login with localhost callback and PKCE exchange.
5. Implement authenticated backend client helpers.
6. Implement `login`, `auth status`, `logout`, `orgs`, `org create`, `projects`, and `project create` commands.
7. Add CLI unit tests for config storage, env resolution, command parsing, and API authorization headers.
8. Update docs for login setup, local token storage, redirect URL requirements, and smoke-test commands.
9. Run typecheck, tests, build, and a manual backend auth smoke check.

## Risks

- Supabase redirect allow-list may reject localhost callback URLs unless configured.
- Browser opening can fail in headless/remote terminals.
- Local file token storage is sensitive; permissions must be enforced.
- Supabase/GitHub redirect configuration can reject localhost callback URLs unless explicitly allow-listed.
- CLI package can drift into SDK responsibilities if too much client abstraction is added now.

## Verification Strategy

- Unit-test config file permissions and redacted status output.
- Unit-test API client sends `Authorization: Bearer <token>`.
- Unit-test command routing without real network calls.
- Run `corepack pnpm typecheck`.
- Run `corepack pnpm test`.
- Run `corepack pnpm build`.
- Manually verify unauthenticated backend still returns `AUTH_REQUIRED`.
- Manually verify login can produce a session when Supabase redirect URLs are configured.

## Edge Cases Covered

- Missing Supabase public config.
- Existing stored config without auth.
- Existing expired auth session.
- Failed browser open with printed fallback URL.
- OAuth callback with `error` instead of `code`.
- OAuth callback timeout.
- Token file directory missing.
- Token file with unsafe permissions.
- Logout clears local auth while preserving non-auth config.
- Backend returns `AUTH_REQUIRED` for stale/revoked token.
