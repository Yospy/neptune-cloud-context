# Neptune OSS Foundation Sprint

## Scope

Add the minimum open-source foundation needed to make Neptune safe to publish early without freezing APIs, npm package boundaries, or product claims.

## Assumptions

- Neptune is early-stage software.
- The repository is intended to be public.
- MIT is the project license.
- npm packages remain private until SDK, MCP, and CLI boundaries stabilize.
- Security reports should use GitHub private vulnerability reporting.
- No real secrets, private URLs, or local-only data should appear in public files.

## Architectural Decisions

- Public documentation must describe the current V1 shape and explicitly say APIs may change.
- Package publishing is not part of this sprint.
- Root docs are the entrypoint; deeper architecture remains in `context/`.
- GitHub readiness is lightweight: CI, Dependabot, and a PR checklist.
- The repo should be treated as public by default during all future work.

## Tasks

1. Add root OSS files: `LICENSE`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, and `CODE_OF_CONDUCT.md`.
2. Add GitHub readiness files for CI, Dependabot, and PR review.
3. Add MIT license metadata while keeping packages private.
4. Tighten ignore rules for logs, build outputs, caches, dependencies, local agent artifacts, and OS files.
5. Update `tasks/todo.md` to make this sprint active.
6. Run install, typecheck, test, and build verification.
7. Review diff for public-readiness and secret exposure.

## Risks

- Public docs could overpromise stability.
- Package metadata could accidentally imply npm publication readiness.
- Local `.env` or machine-specific data could leak if ignore rules are too loose.
- Switching active sprint may pause in-progress backend hardening work.

## Verification Strategy

- Confirm all planned OSS files exist.
- Confirm packages still have `"private": true`.
- Confirm `.env.example` contains placeholders only.
- Confirm CI uses `pnpm` and runs typecheck, tests, and build.
- Run the required verification commands.
- Review changed files for secrets, private URLs, and local-only data.
