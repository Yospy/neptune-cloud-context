# Suppress CLI Dotenv Banner

## Scope

Remove dotenv's startup banner from Neptune CLI commands while preserving project `.env` loading.

## Assumptions

- The banner is emitted by `dotenv` when `loadCliDotEnv` loads a project `.env`.
- CLI commands should remain quiet unless Neptune itself writes useful output.
- `neptune-context-cli@0.1.15` is already published, so this user-visible fix requires a new CLI package version.

## Architectural Decisions

- Suppress dotenv output at the loader boundary with `quiet: true`.
- Keep existing `.env` candidate paths and `override: false` precedence unchanged.
- Release as `neptune-context-cli@0.1.16`.

## Tasks

- Confirm root cause in `packages/cli/src/env.ts`.
- Add regression coverage proving `.env` loads without printing the dotenv banner.
- Bump current CLI release metadata to `0.1.16`.
- Run focused and package verification.
- Review the diff and open a PR.

## Risks

- Dotenv option compatibility could fail TypeScript if unsupported by the installed version.
- Suppressing dotenv output must not hide Neptune command errors.

## Verification Strategy

- `corepack pnpm --filter neptune-context-cli exec vitest run test/env.test.ts`
- `corepack pnpm --filter neptune-context-cli test`
- `corepack pnpm --filter neptune-context-cli typecheck`
- `corepack pnpm --filter neptune-context-cli build`
- `corepack pnpm publish --dry-run --access public --registry=https://registry.npmjs.org/ --no-git-checks` from `packages/cli`

## Verification Notes

- `corepack pnpm --filter neptune-context-cli exec vitest run test/env.test.ts` passed, 5 tests.
- `corepack pnpm --filter neptune-context-cli test` passed, 52 tests.
- `corepack pnpm --filter neptune-context-cli typecheck` passed.
- `corepack pnpm --filter neptune-context-cli build` passed.
- `node packages/cli/dist/index.js current` printed only the org/project state and no dotenv injection banner.
- `corepack pnpm publish --dry-run --access public --registry=https://registry.npmjs.org/ --no-git-checks` from `packages/cli` produced `neptune-context-cli@0.1.16`.
- `git diff --check` passed.
