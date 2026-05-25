# Neptune Context Package Rename Sprint

## Scope

Rename the public npm package surface from the temporary scoped names to product-aligned unscoped names.

## Assumptions

- `neptune-context` and `neptune-context-shared` are available on npm.
- The main user-facing install package should be `neptune-context`.
- The shared contracts package remains a dependency package and should be named `neptune-context-shared`.
- Backend and CLI package names can remain private for this sprint.

## Architectural Decisions

- Use `neptune-context` for the SDK package.
- Use `neptune-context-shared` for shared request/response contracts.
- Update internal imports and TypeScript path aliases so local development matches publish names.
- Keep package versions at `0.1.1` until publish/version strategy is decided.

## Step-by-Step Tasks

1. Rename package metadata.
2. Update workspace imports, dependencies, prebuild filters, and TS aliases.
3. Update docs/context references.
4. Refresh lockfile/package state.
5. Run typecheck, tests, and build.
6. Pack packages and verify clean install/import in a temporary app.

## Risks

- Lockfile can retain stale scoped package names if install is not refreshed.
- Published `@yash_1008/*` packages remain available unless deprecated separately.
- Existing users of the temporary scoped package need a migration note.

## Verification Strategy

- `corepack pnpm install --offline`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- `pnpm pack` shared and SDK packages.
- Clean temp app installs tarballs and imports `neptune-context`.
