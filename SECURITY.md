# Security Policy

## Reporting Vulnerabilities

Do not report vulnerabilities through public GitHub issues.

Use GitHub private vulnerability reporting for this repository. Include:

- Affected area.
- Steps to reproduce.
- Impact.
- Any relevant logs with secrets removed.

## Secret Handling

Never include real secrets, tokens, service role keys, private URLs, or credentials in issues, pull requests, logs, examples, screenshots, or documentation.

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must not be exposed to browsers, client packages, public examples, or agent-visible logs.

CI runs Gitleaks on pull requests and pushes to `main`. The repo config keeps default Gitleaks rules and adds Neptune-specific checks for Supabase service role keys, Supabase JWTs, committed runtime `.env` files, and committed `.neptune/config.json` / `.agentctx/config.json` auth tokens.

If a secret is accidentally committed or exposed, rotate it immediately before continuing normal development.

## Supported Versions

Neptune is early-stage software. Security fixes target the main development branch until formal releases exist.
