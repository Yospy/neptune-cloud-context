# SDK Backend Edge Case Verification Sprint

## Scope

Verify SDK-only behavior against the running backend for auth, validation, access-control, duplicate, network, and resolved-context edge cases.

## Assumptions

- The backend is already running at `http://127.0.0.1:8787`.
- The local Neptune config contains a valid Supabase session.
- Tests must use the SDK surface, not direct database queries or backend internals.
- Token material must not be printed.

## Architectural Decisions

- Use one-off SDK smoke scripts for live verification.
- Treat unsupported backend features, such as archive and supersede flows, as explicit gaps rather than failed SDK mappings.
- Keep live-created smoke records isolated with unique slugs.

## Step-by-Step Tasks

1. Confirm backend health and SDK build/test baseline.
2. Test expired-token refresh through SDK.
3. Test missing/invalid auth behavior.
4. Test wrong org/project/context access and invalid IDs.
5. Test malformed metadata validation.
6. Test SDK network failure normalization.
7. Test concurrent duplicate context uploads.
8. Test resolved-context read/search behavior.
9. Report results and remaining uncovered gaps.

## Risks

- Live smoke records remain in the database because delete/archive is not implemented.
- Expired-token refresh depends on the stored refresh token still being valid.
- Some edge cases can only validate current implemented behavior, not planned archive/supersede flows.

## Verification Strategy

- SDK unit tests.
- SDK build.
- Live SDK calls through the running backend.
- Result summary with pass/fail per edge case.

## Verification Results

Verified on 2026-05-18:

```text
SDK unit tests: 18 passed
SDK build: passed
Backend health: 200 OK
Live SDK edge checks: 22 passed, 0 failed
```

Live smoke records:

```text
org_id: 01bd0fec-630b-418d-b55f-411b011224f6
org_slug: sdk-edge-20260518103820
project_id: abf2ecf1-9bbe-49e2-b28e-18dedcb1afec
project_slug: project-20260518103820
resolved_context_id: f6b8e531-dcba-46a8-bfca-3b95deafe7de
```

Confirmed:

```text
expired token refresh through SDK
missing token returns AUTH_REQUIRED before backend request
invalid bearer token is rejected by backend
invalid org/project/context IDs are normalized into SDK errors
malformed context metadata returns VALIDATION_FAILED
short git_commit returns VALIDATION_FAILED
SDK network failure returns NETWORK_ERROR
concurrent duplicate uploads converge to one context_id and version 1
resolved contexts are excluded from active relevant search
resolved contexts remain fetchable by ID
read/reference calls still succeed on resolved contexts
```

Not covered because support is not implemented yet:

```text
archive context endpoint
supersede context endpoint
true cross-user denial with a second real session
```
