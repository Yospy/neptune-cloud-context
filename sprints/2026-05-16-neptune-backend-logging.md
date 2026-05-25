# Neptune Backend Logging Sprint

## Scope

Add production-grade, low-noise backend logging for local debugging and future production diagnosis.

## Assumptions

- Logs must be structured and safe for production ingestion.
- The terminal should not be cluttered by repetitive health checks.
- Secrets, bearer tokens, and request bodies must never be logged.
- The backend should log one outcome per meaningful request.

## Architectural Decisions

- Use Pino for structured Node.js logging.
- Use `pino-pretty` only when configured for development readability.
- Skip per-request logs for `/health`.
- Emit periodic backend health logs on a configurable interval.
- Include request IDs in request logs and response headers.
- Log stable application error codes for failed requests.

## Tasks

1. Add logging dependencies and env placeholders.
2. Add Pino logger construction with redaction.
3. Add request logging middleware.
4. Add periodic backend health logging.
5. Wire logger into backend startup.
6. Add regression tests for low-noise request logging.
7. Run typecheck, tests, and backend build.
8. Verify logs manually with curl.

## Risks

- Logging request bodies or tokens could leak secrets.
- Logging every health probe could make production logs noisy.
- Logging both route events and request outcomes could duplicate signal.

## Verification Strategy

- Confirm `/health` returns without a request log.
- Confirm protected route failures produce one warning log with an error code.
- Confirm periodic health logs respect `HEALTH_LOG_INTERVAL_MS`.
- Confirm redaction paths include auth and Supabase secret fields.
- Run `pnpm typecheck`, `pnpm test`, and backend build.
