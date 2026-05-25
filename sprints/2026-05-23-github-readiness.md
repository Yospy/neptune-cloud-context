# GitHub Readiness

## Scope

Prepare Neptune for a public GitHub push with accurate README, env placeholders, docs, and repo hygiene.

## Assumptions

- Public users run their own backend and Supabase project.
- Published packages are current: `neptune-context-shared@0.1.2`, `neptune-context@0.1.4`, `neptune-context-mcp@0.1.4`, `neptune-context-cli@0.1.7`.
- Invite commands remain planned, not implemented.

## Architectural Decisions

- README is the public entrypoint.
- `context/` remains deeper implementation documentation.
- GitHub release should be source-first; generated `dist/` stays ignored.

## Tasks

- Rewrite README for self-hosted setup, CLI setup, MCP verification, and project indexes.
- Clarify `.env.example` placeholders and backend-only service role key.
- Update stale context docs and PR checklist.
- Ignore and remove generated Python/package artifacts.
- Initialize this folder as its own Git repository.

## Verification Strategy

- Run install/typecheck/test/build.
- Verify published package versions.
- Verify MCP schema includes `project_index`.
- Scan for placeholder/secrets/local artifacts.

## Verification

- `corepack pnpm install --frozen-lockfile` passed.
- `corepack pnpm typecheck` passed.
- `corepack pnpm -r --workspace-concurrency=1 test` passed.
- `corepack pnpm build` passed.
- npm registry versions match the published package assumptions.
- Fresh `npx -y neptune-context-mcp` schema includes `project_index`.
- Generated Python cache and tarball artifacts are absent.
- Stale publication/private-state wording scan is clean.
- Secret scan found only field names and fake test tokens, not real credentials.
