# Neptune First-User V1 Completion Sprint

## Scope

Complete first-user Neptune V1 readiness with npm-installable CLI/MCP distribution support, one-command setup, diagnostics, and Codex/Claude Code verification guidance.

Invites, role/admin management, and remote HTTP MCP transport remain out of scope.

## Assumptions

- SDK default API URL remains `http://127.0.0.1:8787`.
- `neptune setup` accepts flags and prompts for missing values.
- Setup defaults MCP installation to Codex when no target is supplied.
- External network actions such as npm publish/install and OpenAI sample calls require explicit runtime approval.
- No backend API or database migration is needed.

## Architectural Decisions

- Keep `commands.ts` as routing and move setup/doctor behavior into focused modules.
- Use existing SDK config, auth, org/project, and repo binding helpers.
- Use existing MCP install implementation for Codex and Claude Code.
- Do not store auth tokens, Supabase keys, or service-role keys in MCP config.
- Use Node built-ins for prompts and process checks; do not add new CLI dependencies.

## Step-by-Step Tasks

1. Add sprint tracking and todo entries.
2. Add `neptune setup` command help, parsing, and implementation.
3. Add `neptune doctor` command help, parsing, and implementation.
4. Add focused CLI regression tests for setup and doctor.
5. Run workspace install, typecheck, tests, and build.
6. Run package pack and clean-install smoke checks where possible without publishing.
7. Refresh context docs and sprint verification notes.

## Risks

- Interactive setup can become hard to test unless prompt behavior is injectable.
- Doctor MCP probing can hang unless bounded by timeout.
- Claude Code CLI may not be installed locally, so tests must mock invocation and live verification must report availability.
- The wider git root is `/Users/yashwadgave/Desktop`, with `Cloud Agents/` currently untracked.

## Verification Strategy

- CLI unit tests cover setup and doctor without mutating real user config.
- Full workspace `typecheck`, `test`, and `build` pass.
- Packed CLI/MCP tarballs still include only `dist/`, `package.json`, and npm automatic metadata.
- Clean temp install verifies the package path without using workspace symlinks.
- Live Codex/Claude verification is documented separately because it requires user app/runtime state.

## Verification Results

Verified on 2026-05-19:

```text
corepack pnpm install: passed
corepack pnpm --filter neptune-context-cli test: passed, 28 tests
corepack pnpm typecheck: passed
corepack pnpm test: passed
corepack pnpm build: passed
```

Full test counts:

```text
shared: 6 passed
backend: 38 passed, 1 gated integration skipped
sdk: 24 passed
cli: 28 passed
mcp: 8 passed
```

Package and smoke verification:

```text
neptune-context-cli-0.1.0.tgz: dist/ and package.json only, plus npm automatic LICENSE
neptune-context-mcp-0.1.0.tgz: dist/ and package.json only, plus npm automatic LICENSE
offline clean temp app install: passed
clean smoke passed: neptune --help
clean smoke passed: neptune mcp install --dry-run --target all
local MCP stdio tools/list with /opt/homebrew/bin/node: passed
```

Not executed in this pass:

```text
npm publish
fresh registry install from npm
live Codex app MCP tool call
live Claude Code MCP tool call
OpenAI sample.py network call
```

## Live Backend Regression Results

Verified on 2026-05-19 against `http://127.0.0.1:8787`:

```text
GET /health: 200 OK
CLI auth status: logged in as yashwadgave1008@gmail.com
CLI me: user affeda20-1095-4e6c-9506-17bd7c0720dd, 14 orgs, 13 projects
CLI orgs/projects list: passed
isolated neptune setup with temp config/repo/Codex config: passed
isolated neptune doctor --target codex: passed
MCP stdio tools/list: 17 tools
MCP get_me: passed
MCP create_context/list_relevant/get/read/reference/resolve: passed
duplicate org/project slug checks: Resource already exists.
```

Live records created:

```text
org_id: 47a8a571-eca6-49c4-89d7-e9ff41282bcd
org_slug: live-setup-20260519140653
project_id: f31c6ab2-d8f2-472c-b010-9edabb9bf89f
project_slug: project-20260519140653
context_id: 217fe634-113d-4d8a-8e80-970524c75991
```

Real local-machine caveat:

```text
The current repo has no .neptune/config.json binding.
The real ~/.codex/config.toml currently has no Neptune MCP entry.
Use neptune setup or neptune mcp install before real Codex app testing.
```
