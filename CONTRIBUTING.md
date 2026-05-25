# Contributing

Neptune is early-stage software. Keep changes small, reproducible, and safe for a public repository.

## Development Setup

```bash
corepack enable
corepack pnpm install
cp .env.example .env
```

Use placeholder values in examples and docs. Never commit real `.env` values.

## Sprint Workflow

Non-trivial work requires a sprint plan under `sprints/` before implementation. The active sprint is tracked in `tasks/todo.md`.

Each sprint should include scope, assumptions, decisions, tasks, risks, and verification strategy.

## Required Checks

Run these before marking work complete:

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Run package-specific checks when the change is scoped to one package.

## Public Repository Rules

- Do not commit secrets, tokens, credentials, private URLs, customer data, or local machine details.
- Keep `.env.example` placeholder-only.
- Treat `SUPABASE_SERVICE_ROLE_KEY` as server-only.
- Publish package changes only intentionally, after version bumps, tests, build, and dry-run publish checks.
- Document user-facing behavior changes in the relevant `context/` file.

## Pull Requests

Pull requests should include:

- What changed.
- How it was verified.
- Any known limitations.
- Confirmation that no secrets or local-only data were added.
