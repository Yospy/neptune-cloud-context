import type { CreateContextRequest } from "neptune-context-shared";

export const userId = "22222222-2222-4222-8222-222222222222";
export const otherUserId = "55555555-5555-4555-8555-555555555555";
export const projectId = "11111111-1111-4111-8111-111111111111";
export const orgId = "33333333-3333-4333-8333-333333333333";
export const contextId = "44444444-4444-4444-8444-444444444444";

export function createContextInput(
  overrides: Partial<CreateContextRequest> = {}
): CreateContextRequest {
  return {
    project_id: projectId,
    title: "Auth UI Login Contract",
    summary: "Frontend login sends email and password.",
    content_md: "# Auth UI Login Contract\n\nSend email and password.",
    source_workstream: "frontend",
    target_workstreams: ["backend"],
    domain: "auth",
    code_areas: ["login", "session"],
    context_type: "ui_contract",
    priority: "normal",
    tags: ["jwt"],
    repo_paths: ["src/features/auth/LoginForm.tsx"],
    related_files: [],
    ...overrides
  };
}

export function baseTables() {
  return {
    orgs: [
      {
        id: orgId,
        slug: "acme",
        name: "Acme",
        created_at: "2026-05-16T12:00:00.000Z"
      }
    ],
    user_profiles: [
      {
        id: userId,
        email: "user@example.com",
        display_name: "Test User",
        avatar_url: "https://example.com/avatar.png",
        provider: "github",
        last_seen_at: "2026-05-16T12:00:00.000Z",
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: "2026-05-16T12:00:00.000Z"
      }
    ],
    org_members: [
      {
        org_id: orgId,
        user_id: userId,
        role: "owner",
        created_at: "2026-05-16T12:00:00.000Z"
      }
    ],
    projects: [
      {
        id: projectId,
        org_id: orgId,
        slug: "checkout",
        name: "Checkout",
        created_at: "2026-05-16T12:00:00.000Z"
      }
    ],
    project_members: [
      {
        org_id: orgId,
        project_id: projectId,
        user_id: userId,
        role: "admin",
        default_workstream: "backend",
        created_at: "2026-05-16T12:00:00.000Z"
      }
    ],
    contexts: [],
    context_versions: [],
    context_reads: [],
    context_references: [],
    context_events: []
  };
}
