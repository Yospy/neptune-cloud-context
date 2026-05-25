# SDK Public Packaging Readiness Sprint

## Scope

Make the shared and SDK packages ready for public npm distribution and verify public install.

## Assumptions

- SDK backend default remains local: `http://127.0.0.1:8787`.
- Users can override the backend with `NEPTUNE_API_URL` or stored config until a stable hosted API exists.
- Published names are `neptune-context-shared` and `neptune-context`.
- Initial `0.1.0` publish used `npm publish` and left a bad `workspace:*` dependency in the SDK tarball.
- Publicly installable version is `0.1.1`, published with `pnpm publish` so the SDK dependency rewrites to `neptune-context-shared@0.1.1`.

## Architectural Decisions

- Keep workspace dependencies as `workspace:*` in the repo.
- Use `pnpm pack` for publish simulation because it rewrites workspace dependencies to concrete package versions.
- Limit packed files to `dist/` and `package.json`.
- Declare Node `>=20` because the Supabase SDK dependency requires it.

## Step-by-Step Tasks

1. Update shared package metadata for public packing.
2. Update SDK package metadata for public packing.
3. Add/confirm SDK tests for local default URL and `NEPTUNE_API_URL` override.
4. Refresh lockfile/package state offline.
5. Run workspace typecheck, tests, and build.
6. Pack shared and SDK into `/tmp/neptune-pack-check`.
7. Inspect tarball contents for only `dist/` and `package.json`.
8. Install both tarballs in a clean temporary app and verify SDK runtime behavior.
9. Document verification results and review package readiness.

## Risks

- Raw `npm pack` keeps workspace dependencies unresolved; use `pnpm pack`.
- Installing SDK fails if the published tarball contains `workspace:*`; use `pnpm publish`.
- Node 18 environments may install with warnings or fail in stricter package managers.

## Verification Strategy

- `corepack pnpm install --offline`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- `corepack pnpm publish --access public --no-git-checks` from `packages/shared`
- `corepack pnpm publish --access public --no-git-checks` from `packages/sdk`
- Clean temporary app imports `neptune-context`, verifies default local API URL, env override, bearer auth header, and receipt formatter.
