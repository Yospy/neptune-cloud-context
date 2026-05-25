# Context Progress Refresh Sprint

## Scope

Update the `context/` docs to match the verified Neptune backend implementation after auth, user profiles, org/project membership, context lifecycle, and DB rename cutover.

## Assumptions

- Backend core is implemented and live-tested.
- SDK, MCP, invite flow, role-management commands, and repo setup binding remain future work.
- Context docs should distinguish implemented behavior from planned behavior.

## Tasks

1. Update product and app-flow status.
2. Update backend endpoint inventory and verified behavior.
3. Update database schema to include `user_profiles` and current implemented tables.
4. Update CLI token storage, commands, and compatibility notes.
5. Update SDK/MCP docs to show current wrapper status.
6. Review for stale implemented/planned claims.

## Verification

- Search `context/` for stale AgentCtx naming.
- Search `context/` for endpoint/schema claims that contradict the current backend.
