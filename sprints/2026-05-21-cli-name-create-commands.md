# CLI Name Create Commands

## Scope

Allow `neptune org create <name>` and `neptune project create <name>` to accept human-readable names and derive slugs automatically, while preserving existing slug-based usage.

## Assumptions

- Existing commands using lowercase slugs must keep working.
- `--name` remains an override for display name.
- Project creation still needs an org, but may accept it as `--org` or as a second positional value.

## Architectural Decisions

- Keep this in the CLI layer only.
- Do not change SDK/backend APIs.
- Use deterministic slug derivation before calling existing create APIs.

## Tasks

- Update CLI help and usage text.
- Add slug derivation for org/project create positional input.
- Allow project create to resolve org by second positional org name/slug.
- Add focused CLI tests.
- Run CLI tests.

## Risks

- Slug derivation may surprise users if names contain unusual symbols.
- Existing slug behavior must remain backward compatible.

## Verification Strategy

- Run `corepack pnpm --filter neptune-context-cli test`.
- Review diff for CLI-only scope.
