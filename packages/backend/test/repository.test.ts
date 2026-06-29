import { describe, expect, it, vi } from "vitest";
import { SupabaseContextRepository } from "../src/repository.js";
import { createFakeSupabase } from "./fake-supabase.js";
import {
  addForeignProjectContext,
  baseTables,
  contextId,
  createContextInput,
  orgId,
  otherContextId,
  otherProjectId,
  otherUserId,
  projectId,
  userId
} from "./helpers.js";

const createdAt = "2026-05-16T12:00:00.000Z";
const updatedAt = "2026-05-16T12:01:00.000Z";

function receipt(version: number, changed: boolean) {
  return {
    ok: true,
    changed,
    receipt: {
      context_id: contextId,
      org: "acme",
      project: "checkout",
      title: "Auth UI Login Contract",
      source_workstream: "frontend",
      target_workstreams: ["backend"],
      domain: "auth",
      code_areas: ["login", "session"],
      context_type: "ui_contract",
      status: "active",
      version,
      created_at: "2026-05-16T12:00:00.000Z",
      content_hash: "sha256:test"
    }
  };
}

function contextTables(version = 1, updatedBy = userId) {
  const tables = baseTables();
  tables.user_profiles.push({
    id: otherUserId,
    email: "other@example.com",
    display_name: "Other User",
    avatar_url: null,
    provider: "github",
    last_seen_at: createdAt,
    created_at: createdAt,
    updated_at: createdAt
  });
  tables.contexts.push({
    id: contextId,
    org_id: orgId,
    project_id: projectId,
    title: "Auth UI Login Contract",
    summary: "Frontend login sends email and password.",
    content_md: "# Auth UI Login Contract\n\nSend email and password.",
    content_hash: "sha256:test",
    source_workstream: "frontend",
    target_workstreams: ["backend"],
    domain: "auth",
    code_areas: ["login", "session"],
    context_type: "ui_contract",
    priority: "normal",
    status: "active",
    repo_paths: ["src/features/auth/LoginForm.tsx"],
    related_files: [],
    tags: ["jwt"],
    created_by: userId,
    created_at: createdAt,
    updated_at: updatedAt,
    version
  });
  tables.context_versions.push({
    context_id: contextId,
    org_id: orgId,
    project_id: projectId,
    version,
    content_md: "# Auth UI Login Contract\n\nSend email and password.",
    content_hash: "sha256:test",
    metadata: {},
    created_by: updatedBy,
    created_at: updatedAt
  });
  return tables;
}

function rpcClient(data: unknown = { ok: true }, error: unknown = null, tables = baseTables()) {
  const fake = createFakeSupabase(tables);
  return {
    from: fake.from,
    rpc: vi.fn(async () => ({ data, error }))
  };
}

describe("SupabaseContextRepository", () => {
  it("syncs authenticated user profiles", async () => {
    const tables = baseTables();
    const repo = new SupabaseContextRepository(createFakeSupabase(tables));

    await repo.upsertUserProfile({
      id: userId,
      email: "updated@example.com",
      display_name: "Updated User",
      avatar_url: "https://example.com/new-avatar.png",
      provider: "github"
    });

    expect(tables.user_profiles[0]).toMatchObject({
      id: userId,
      email: "updated@example.com",
      display_name: "Updated User",
      avatar_url: "https://example.com/new-avatar.png",
      provider: "github"
    });
    expect(tables.user_profiles[0].last_seen_at).toEqual(expect.any(String));
  });

  it("returns current user profile and memberships", async () => {
    const repo = new SupabaseContextRepository(createFakeSupabase(baseTables()));

    const result = await repo.getMe({ id: userId });

    expect(result.user).toMatchObject({
      id: userId,
      email: "user@example.com",
      display_name: "Test User",
      provider: "github"
    });
    expect(result.orgs).toHaveLength(1);
    expect(result.projects).toHaveLength(1);
  });

  it("creates orgs through an RPC", async () => {
    const client = rpcClient({
      ok: true,
      org: {
        id: orgId,
        slug: "acme",
        name: "Acme",
        role: "owner",
        created_at: "2026-05-16T12:00:00.000Z"
      }
    });
    const repo = new SupabaseContextRepository(client);

    const result = await repo.createOrg({ slug: "acme", name: "Acme" }, { id: userId });

    expect(result.org.slug).toBe("acme");
    expect(client.rpc).toHaveBeenCalledWith("neptune_create_org", {
      p_actor_user_id: userId,
      p_slug: "acme",
      p_name: "Acme"
    });
  });

  it("maps duplicate org slugs to conflict errors", async () => {
    const client = rpcClient(null, {
      code: "23505",
      message: 'duplicate key value violates unique constraint "orgs_slug_key"'
    });
    const repo = new SupabaseContextRepository(client);

    await expect(repo.createOrg({ slug: "acme", name: "Acme" }, { id: userId }))
      .rejects.toMatchObject({
        code: "CONFLICT",
        status: 409,
        message: "Resource already exists."
      });
  });

  it("creates projects through an RPC", async () => {
    const client = rpcClient({
      ok: true,
      project: {
        id: projectId,
        org_id: orgId,
        slug: "checkout",
        name: "Checkout",
        role: "admin",
        default_workstream: "backend",
        created_at: "2026-05-16T12:00:00.000Z"
      }
    });
    const repo = new SupabaseContextRepository(client);

    const result = await repo.createProject(
      {
        org_id: orgId,
        slug: "checkout",
        name: "Checkout",
        default_workstream: "backend"
      },
      { id: userId }
    );

    expect(result.project.slug).toBe("checkout");
    expect(client.rpc).toHaveBeenCalledWith("neptune_create_project", {
      p_actor_user_id: userId,
      p_org_id: orgId,
      p_slug: "checkout",
      p_name: "Checkout",
      p_default_workstream: "backend"
    });
  });

  it("maps duplicate project slugs to conflict errors", async () => {
    const client = rpcClient(null, {
      code: "23505",
      message: 'duplicate key value violates unique constraint "projects_org_id_slug_key"'
    });
    const repo = new SupabaseContextRepository(client);

    await expect(
      repo.createProject(
        {
          org_id: orgId,
          slug: "checkout",
          name: "Checkout",
          default_workstream: "backend"
        },
        { id: userId }
      )
    ).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
      message: "Resource already exists."
    });
  });

  it("creates context through the transactional upsert RPC", async () => {
    const client = rpcClient(receipt(1, true), null, contextTables());
    const repo = new SupabaseContextRepository(client);

    const result = await repo.createContext(createContextInput(), { id: userId });

    expect(result.changed).toBe(true);
    expect(result.receipt.version).toBe(1);
    expect(result.receipt.created_by_user.email).toBe("user@example.com");
    expect(result.receipt.updated_by_user.email).toBe("user@example.com");
    expect(client.rpc).toHaveBeenCalledWith(
      "neptune_upsert_context",
      expect.objectContaining({
        p_actor_user_id: userId,
        p_payload: expect.objectContaining({
          title: "Auth UI Login Contract",
          content_hash: expect.stringMatching(/^sha256:/)
        })
      })
    );
  });

  it("returns duplicate context receipts from the upsert RPC", async () => {
    const client = rpcClient(receipt(1, false), null, contextTables());
    const repo = new SupabaseContextRepository(client);

    const result = await repo.createContext(createContextInput(), { id: userId });

    expect(result.changed).toBe(false);
    expect(result.receipt.version).toBe(1);
    expect(result.receipt.created_by_user.id).toBe(userId);
    expect(result.receipt.updated_by_user.id).toBe(userId);
  });

  it("returns changed context receipts from the upsert RPC", async () => {
    const client = rpcClient(receipt(2, true), null, contextTables(2, otherUserId));
    const repo = new SupabaseContextRepository(client);

    const result = await repo.createContext(
      createContextInput({ content_md: "# Auth UI Login Contract\n\nChanged." }),
      { id: userId }
    );

    expect(result.changed).toBe(true);
    expect(result.receipt.version).toBe(2);
    expect(result.receipt.created_by_user.id).toBe(userId);
    expect(result.receipt.updated_by_user.id).toBe(otherUserId);
  });

  it("maps RPC access errors to deterministic app errors", async () => {
    const client = rpcClient(null, { message: "PROJECT_ACCESS_DENIED" });
    const repo = new SupabaseContextRepository(client);

    await expect(
      repo.createContext(createContextInput({ project_id: otherProjectId }), { id: userId })
    ).rejects.toMatchObject({
      code: "PROJECT_ACCESS_DENIED"
    });
  });

  it("maps RPC access errors for context references", async () => {
    const client = rpcClient(null, { message: "PROJECT_ACCESS_DENIED" });
    const repo = new SupabaseContextRepository(client);

    await expect(
      repo.markContextReferenced(otherContextId, { id: userId }, { agent_name: "codex" })
    ).rejects.toMatchObject({
      code: "PROJECT_ACCESS_DENIED"
    });
  });

  it("maps RPC access errors for context resolves", async () => {
    const client = rpcClient(null, { message: "PROJECT_ACCESS_DENIED" });
    const repo = new SupabaseContextRepository(client);

    await expect(
      repo.resolveContext(otherContextId, { id: userId }, { agent_name: "codex" })
    ).rejects.toMatchObject({
      code: "PROJECT_ACCESS_DENIED"
    });
  });

  it("lists orgs for the authenticated user", async () => {
    const repo = new SupabaseContextRepository(createFakeSupabase(baseTables()));

    const result = await repo.listOrgs({ id: userId });

    expect(result.orgs).toEqual([
      {
        id: orgId,
        slug: "acme",
        name: "Acme",
        role: "owner",
        created_at: "2026-05-16T12:00:00.000Z"
      }
    ]);
  });

  it("lists org members with product profiles", async () => {
    const repo = new SupabaseContextRepository(createFakeSupabase(baseTables()));

    const result = await repo.listOrgMembers(orgId, { id: userId });

    expect(result.members).toEqual([
      {
        user: expect.objectContaining({
          id: userId,
          email: "user@example.com",
          display_name: "Test User"
        }),
        role: "owner",
        created_at: "2026-05-16T12:00:00.000Z"
      }
    ]);
  });

  it("denies org member listing for non-members", async () => {
    const repo = new SupabaseContextRepository(createFakeSupabase(baseTables()));

    await expect(repo.listOrgMembers(orgId, { id: otherUserId })).rejects.toMatchObject({
      code: "ORG_ACCESS_DENIED"
    });
  });

  it("lists projects for the authenticated user", async () => {
    const repo = new SupabaseContextRepository(createFakeSupabase(baseTables()));

    const result = await repo.listProjects({}, { id: userId });

    expect(result.projects).toEqual([
      {
        id: projectId,
        org_id: orgId,
        slug: "checkout",
        name: "Checkout",
        role: "admin",
        default_workstream: "backend",
        created_at: "2026-05-16T12:00:00.000Z"
      }
    ]);
  });

  it("deletes projects for project admins", async () => {
    const tables = baseTables();
    const repo = new SupabaseContextRepository(createFakeSupabase(tables));

    await expect(repo.deleteProject(projectId, { id: userId })).resolves.toEqual({ ok: true });

    expect(tables.projects).toEqual([]);
  });

  it("denies project deletion for non-admin project members", async () => {
    const tables = baseTables();
    tables.project_members[0].role = "editor";
    const repo = new SupabaseContextRepository(createFakeSupabase(tables));

    await expect(repo.deleteProject(projectId, { id: userId })).rejects.toMatchObject({
      code: "PROJECT_ACCESS_DENIED"
    });
    expect(tables.projects).toHaveLength(1);
  });

  it("lists project members with product profiles", async () => {
    const repo = new SupabaseContextRepository(createFakeSupabase(baseTables()));

    const result = await repo.listProjectMembers(projectId, { id: userId });

    expect(result.members).toEqual([
      {
        user: expect.objectContaining({
          id: userId,
          email: "user@example.com",
          display_name: "Test User"
        }),
        role: "admin",
        default_workstream: "backend",
        created_at: "2026-05-16T12:00:00.000Z"
      }
    ]);
  });

  it("denies project member listing for non-members", async () => {
    const repo = new SupabaseContextRepository(createFakeSupabase(baseTables()));

    await expect(repo.listProjectMembers(projectId, { id: otherUserId })).rejects.toMatchObject({
      code: "PROJECT_ACCESS_DENIED"
    });
  });

  it("denies relevant context listing for a foreign project", async () => {
    const repo = new SupabaseContextRepository(
      createFakeSupabase(addForeignProjectContext(baseTables()))
    );

    await expect(
      repo.listRelevantContext(
        {
          project_id: otherProjectId,
          target_workstream: "backend",
          unread_only: false,
          limit: 10
        },
        { id: userId }
      )
    ).rejects.toMatchObject({
      code: "PROJECT_ACCESS_DENIED"
    });
  });

  it("denies direct context reads for a foreign project", async () => {
    const repo = new SupabaseContextRepository(
      createFakeSupabase(addForeignProjectContext(baseTables()))
    );

    await expect(repo.getContext(otherContextId, { id: userId })).rejects.toMatchObject({
      code: "PROJECT_ACCESS_DENIED"
    });
  });

  it("denies read receipts for a foreign project context", async () => {
    const repo = new SupabaseContextRepository(
      createFakeSupabase(addForeignProjectContext(baseTables()))
    );

    await expect(
      repo.markContextRead(otherContextId, { id: userId }, "codex")
    ).rejects.toMatchObject({
      code: "PROJECT_ACCESS_DENIED"
    });
  });

  it("lists only active relevant contexts", async () => {
    const tables = baseTables();
    tables.contexts.push(
      {
        id: contextId,
        org_id: orgId,
        project_id: projectId,
        title: "Active Auth",
        summary: "Relevant.",
        content_md: "# Active",
        content_hash: "sha256:active",
        source_workstream: "frontend",
        target_workstreams: ["backend"],
        domain: "auth",
        code_areas: ["login"],
        context_type: "ui_contract",
        priority: "normal",
        status: "active",
        repo_paths: [],
        related_files: [],
        tags: [],
        created_by: userId,
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: "2026-05-16T12:01:00.000Z",
        version: 1
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        org_id: orgId,
        project_id: projectId,
        title: "Resolved Auth",
        summary: "Resolved.",
        content_md: "# Resolved",
        content_hash: "sha256:resolved",
        source_workstream: "frontend",
        target_workstreams: ["backend"],
        domain: "auth",
        code_areas: ["login"],
        context_type: "ui_contract",
        priority: "normal",
        status: "resolved",
        repo_paths: [],
        related_files: [],
        tags: [],
        created_by: userId,
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: "2026-05-16T12:02:00.000Z",
        version: 1
      }
    );
    const repo = new SupabaseContextRepository(createFakeSupabase(tables));

    const contexts = await repo.listRelevantContext(
      {
        project_id: projectId,
        target_workstream: "backend",
        domain: "auth",
        unread_only: false,
        limit: 10
      },
      { id: userId }
    );

    expect(contexts.map((context) => context.title)).toEqual(["Active Auth"]);
    expect(contexts[0]).toMatchObject({
      created_by_user: { id: userId, email: "user@example.com" },
      updated_by_user: { id: userId, email: "user@example.com" }
    });
  });

  it("ranks query matches ahead of newer generic contexts", async () => {
    const tables = baseTables();
    tables.contexts.push(
      {
        id: contextId,
        org_id: orgId,
        project_id: projectId,
        title: "Auth Login API Contract",
        summary: "Backend login endpoint accepts email and password.",
        content_md: "# Auth Login API Contract\n\nThe API returns access and refresh tokens.",
        content_hash: "sha256:auth-api",
        source_workstream: "backend",
        target_workstreams: ["backend"],
        domain: "auth",
        code_areas: ["login"],
        context_type: "api_contract",
        priority: "normal",
        status: "active",
        repo_paths: ["packages/backend/src/app.ts"],
        related_files: [],
        tags: ["auth", "login", "api"],
        created_by: userId,
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: "2026-05-16T12:01:00.000Z",
        version: 1
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        org_id: orgId,
        project_id: projectId,
        title: "Recent Build Notes",
        summary: "Latest packaging and release notes.",
        content_md: "# Recent Build Notes\n\nPackage metadata changed.",
        content_hash: "sha256:build",
        source_workstream: "infra",
        target_workstreams: ["backend"],
        domain: "infra",
        code_areas: ["build"],
        context_type: "implementation_note",
        priority: "normal",
        status: "active",
        repo_paths: ["package.json"],
        related_files: [],
        tags: ["release"],
        created_by: userId,
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: "2026-05-16T12:10:00.000Z",
        version: 1
      }
    );
    const repo = new SupabaseContextRepository(createFakeSupabase(tables));

    const contexts = await repo.listRelevantContext(
      {
        project_id: projectId,
        target_workstream: "backend",
        query: "latest backend auth login API contract",
        unread_only: false,
        limit: 2
      },
      { id: userId }
    );

    expect(contexts.map((context) => context.title)).toEqual(["Auth Login API Contract"]);
    expect(contexts[0].match_reason).toContain("Matched query");
  });

  it("retrieves recent active context project-wide without a workstream", async () => {
    const tables = baseTables();
    tables.contexts.push(
      {
        id: contextId,
        org_id: orgId,
        project_id: projectId,
        title: "Backend Auth Contract",
        summary: "Backend auth API details.",
        content_md: "# Backend Auth Contract",
        content_hash: "sha256:auth",
        source_workstream: "backend",
        target_workstreams: ["backend"],
        domain: "auth",
        code_areas: ["login"],
        context_type: "api_contract",
        priority: "normal",
        status: "active",
        repo_paths: [],
        related_files: [],
        tags: [],
        created_by: userId,
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: "2026-05-16T12:01:00.000Z",
        version: 1
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        org_id: orgId,
        project_id: projectId,
        title: "Recent Release Notes",
        summary: "Latest package and deploy context.",
        content_md: "# Recent Release Notes",
        content_hash: "sha256:release",
        source_workstream: "docs",
        target_workstreams: ["docs", "general"],
        domain: "release",
        code_areas: ["cli"],
        context_type: "implementation_note",
        priority: "low",
        status: "active",
        repo_paths: [],
        related_files: [],
        tags: [],
        created_by: userId,
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: "2026-05-16T12:05:00.000Z",
        version: 1
      }
    );
    const repo = new SupabaseContextRepository(createFakeSupabase(tables));

    const contexts = await repo.retrieveContext(
      {
        project_id: projectId,
        intent: "latest context",
        mode: "smart",
        limit: 2
      },
      { id: userId }
    );

    expect(contexts.map((context) => context.title)).toEqual([
      "Recent Release Notes",
      "Backend Auth Contract"
    ]);
    expect(contexts[0]).toMatchObject({
      match_kind: "recent",
      match_reason: expect.stringContaining("recent active project context")
    });
  });

  it("falls back to recent project context for typo intent misses", async () => {
    const tables = baseTables();
    tables.contexts.push(
      {
        id: contextId,
        org_id: orgId,
        project_id: projectId,
        title: "Older Auth Notes",
        summary: "Auth setup details.",
        content_md: "# Older Auth Notes",
        content_hash: "sha256:older",
        source_workstream: "backend",
        target_workstreams: ["backend"],
        domain: "auth",
        code_areas: ["login"],
        context_type: "setup_note",
        priority: "normal",
        status: "active",
        repo_paths: [],
        related_files: [],
        tags: [],
        created_by: userId,
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: "2026-05-16T12:01:00.000Z",
        version: 1
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        org_id: orgId,
        project_id: projectId,
        title: "Newest Context Upload",
        summary: "The most recent active note.",
        content_md: "# Newest Context Upload",
        content_hash: "sha256:newest",
        source_workstream: "docs",
        target_workstreams: ["docs"],
        domain: "ops",
        code_areas: ["mcp"],
        context_type: "implementation_note",
        priority: "low",
        status: "active",
        repo_paths: [],
        related_files: [],
        tags: [],
        created_by: userId,
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: "2026-05-16T12:07:00.000Z",
        version: 1
      }
    );
    const repo = new SupabaseContextRepository(createFakeSupabase(tables));

    const contexts = await repo.retrieveContext(
      {
        project_id: projectId,
        intent: "elitist context",
        mode: "smart",
        limit: 1
      },
      { id: userId }
    );

    expect(contexts.map((context) => context.title)).toEqual(["Newest Context Upload"]);
    expect(contexts[0].match_kind).toBe("recent");
  });

  it("uses smart routing hints as boosts instead of filters", async () => {
    const tables = baseTables();
    tables.contexts.push(
      {
        id: contextId,
        org_id: orgId,
        project_id: projectId,
        title: "Backend Binding Notes",
        summary: "Backend project binding details.",
        content_md: "# Backend Binding Notes",
        content_hash: "sha256:backend",
        source_workstream: "backend",
        target_workstreams: ["backend"],
        domain: "binding",
        code_areas: ["project-binding"],
        context_type: "implementation_note",
        priority: "normal",
        status: "active",
        repo_paths: [],
        related_files: [],
        tags: [],
        created_by: userId,
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: "2026-05-16T12:01:00.000Z",
        version: 1
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        org_id: orgId,
        project_id: projectId,
        title: "Newer Docs Note",
        summary: "Newer docs-only context.",
        content_md: "# Newer Docs Note",
        content_hash: "sha256:docs",
        source_workstream: "docs",
        target_workstreams: ["docs"],
        domain: "docs",
        code_areas: ["readme"],
        context_type: "setup_note",
        priority: "low",
        status: "active",
        repo_paths: [],
        related_files: [],
        tags: [],
        created_by: userId,
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: "2026-05-16T12:08:00.000Z",
        version: 1
      }
    );
    const repo = new SupabaseContextRepository(createFakeSupabase(tables));

    const contexts = await repo.retrieveContext(
      {
        project_id: projectId,
        mode: "smart",
        target_workstream: "backend",
        limit: 2
      },
      { id: userId }
    );

    expect(contexts.map((context) => context.title)).toEqual([
      "Backend Binding Notes",
      "Newer Docs Note"
    ]);
    expect(contexts[0].match_kind).toBe("hint");
  });

  it("applies routing filters in strict retrieval mode", async () => {
    const tables = baseTables();
    tables.contexts.push(
      {
        id: contextId,
        org_id: orgId,
        project_id: projectId,
        title: "Backend Binding Notes",
        summary: "Backend project binding details.",
        content_md: "# Backend Binding Notes",
        content_hash: "sha256:backend",
        source_workstream: "backend",
        target_workstreams: ["backend"],
        domain: "binding",
        code_areas: ["project-binding"],
        context_type: "implementation_note",
        priority: "normal",
        status: "active",
        repo_paths: [],
        related_files: [],
        tags: [],
        created_by: userId,
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: "2026-05-16T12:01:00.000Z",
        version: 1
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        org_id: orgId,
        project_id: projectId,
        title: "Docs Binding Notes",
        summary: "Docs project binding details.",
        content_md: "# Docs Binding Notes",
        content_hash: "sha256:docs",
        source_workstream: "docs",
        target_workstreams: ["docs"],
        domain: "binding",
        code_areas: ["project-binding"],
        context_type: "implementation_note",
        priority: "low",
        status: "active",
        repo_paths: [],
        related_files: [],
        tags: [],
        created_by: userId,
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: "2026-05-16T12:08:00.000Z",
        version: 1
      }
    );
    const repo = new SupabaseContextRepository(createFakeSupabase(tables));

    const contexts = await repo.retrieveContext(
      {
        project_id: projectId,
        mode: "strict",
        target_workstream: "backend",
        domain: "binding",
        limit: 10
      },
      { id: userId }
    );

    expect(contexts.map((context) => context.title)).toEqual(["Backend Binding Notes"]);
  });

  it("filters relevant contexts by updated_after", async () => {
    const tables = baseTables();
    tables.contexts.push(
      {
        id: contextId,
        org_id: orgId,
        project_id: projectId,
        title: "Older Auth",
        summary: "Older relevant context.",
        content_md: "# Older Auth",
        content_hash: "sha256:older",
        source_workstream: "frontend",
        target_workstreams: ["backend"],
        domain: "auth",
        code_areas: ["login"],
        context_type: "ui_contract",
        priority: "normal",
        status: "active",
        repo_paths: [],
        related_files: [],
        tags: [],
        created_by: userId,
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: "2026-05-16T12:01:00.000Z",
        version: 1
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        org_id: orgId,
        project_id: projectId,
        title: "Newer Auth",
        summary: "Newer relevant context.",
        content_md: "# Newer Auth",
        content_hash: "sha256:newer",
        source_workstream: "frontend",
        target_workstreams: ["backend"],
        domain: "auth",
        code_areas: ["login"],
        context_type: "ui_contract",
        priority: "normal",
        status: "active",
        repo_paths: [],
        related_files: [],
        tags: [],
        created_by: userId,
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: "2026-05-16T12:03:00.000Z",
        version: 1
      }
    );
    const repo = new SupabaseContextRepository(createFakeSupabase(tables));

    const contexts = await repo.listRelevantContext(
      {
        project_id: projectId,
        target_workstream: "backend",
        updated_after: "2026-05-16T12:02:00.000Z",
        unread_only: false,
        limit: 10
      },
      { id: userId }
    );

    expect(contexts.map((context) => context.title)).toEqual(["Newer Auth"]);
  });

  it("returns publisher identity on direct context reads", async () => {
    const repo = new SupabaseContextRepository(createFakeSupabase(contextTables()));

    const context = await repo.getContext(contextId, { id: userId });

    expect(context).toMatchObject({
      id: contextId,
      created_by_user: { id: userId, email: "user@example.com" },
      updated_by_user: { id: userId, email: "user@example.com" }
    });
  });

  it("does not fake updater identity when a current version row is missing", async () => {
    const tables = contextTables(2);
    tables.context_versions = [];
    const repo = new SupabaseContextRepository(createFakeSupabase(tables));

    await expect(repo.getContext(contextId, { id: userId })).rejects.toMatchObject({
      code: "INTERNAL_ERROR"
    });
  });

  it("excludes read contexts when unread_only is true", async () => {
    const tables = baseTables();
    tables.contexts.push({
      id: contextId,
      org_id: orgId,
      project_id: projectId,
      title: "Active Auth",
      summary: "Relevant.",
      content_md: "# Active",
      content_hash: "sha256:active",
      source_workstream: "frontend",
      target_workstreams: ["backend"],
      domain: "auth",
      code_areas: ["login"],
      context_type: "ui_contract",
      priority: "normal",
      status: "active",
      repo_paths: [],
      related_files: [],
      tags: [],
      created_by: userId,
      created_at: "2026-05-16T12:00:00.000Z",
      updated_at: "2026-05-16T12:01:00.000Z",
      version: 1
    });
    tables.context_reads.push({
      context_id: contextId,
      org_id: orgId,
      project_id: projectId,
      user_id: userId,
      agent_name: "codex"
    });
    const repo = new SupabaseContextRepository(createFakeSupabase(tables));

    const contexts = await repo.listRelevantContext(
      {
        project_id: projectId,
        target_workstream: "backend",
        unread_only: true,
        limit: 10
      },
      { id: userId }
    );

    expect(contexts).toEqual([]);
  });

  it("returns older unread contexts when newer candidates were already read", async () => {
    const tables = baseTables();
    for (let index = 0; index < 60; index += 1) {
      const id = `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, "0")}`;
      tables.contexts.push({
        id,
        org_id: orgId,
        project_id: projectId,
        title: `Backend Context ${index}`,
        summary: "Relevant backend context.",
        content_md: "# Backend Context",
        content_hash: `sha256:${index}`,
        source_workstream: "frontend",
        target_workstreams: ["backend"],
        domain: "auth",
        code_areas: ["login"],
        context_type: "ui_contract",
        priority: "normal",
        status: "active",
        repo_paths: [],
        related_files: [],
        tags: [],
        created_by: userId,
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: `2026-05-16T12:${String(59 - index).padStart(2, "0")}:00.000Z`,
        version: 1
      });
      if (index < 55) {
        tables.context_reads.push({
          context_id: id,
          org_id: orgId,
          project_id: projectId,
          user_id: userId,
          agent_name: "codex"
        });
      }
    }
    const repo = new SupabaseContextRepository(createFakeSupabase(tables));

    const contexts = await repo.listRelevantContext(
      {
        project_id: projectId,
        target_workstream: "backend",
        unread_only: true,
        limit: 5
      },
      { id: userId }
    );

    expect(contexts.map((context) => context.title)).toEqual([
      "Backend Context 55",
      "Backend Context 56",
      "Backend Context 57",
      "Backend Context 58",
      "Backend Context 59"
    ]);
  });

  it("marks contexts referenced through an RPC", async () => {
    const client = rpcClient({ ok: true });
    const repo = new SupabaseContextRepository(client);

    await repo.markContextReferenced(contextId, { id: userId }, { agent_name: "codex" });

    expect(client.rpc).toHaveBeenCalledWith("neptune_reference_context", {
      p_actor_user_id: userId,
      p_context_id: contextId,
      p_agent_name: "codex",
      p_note: null,
      p_repo_path: null,
      p_git_commit: null
    });
  });

  it("resolves contexts through an RPC", async () => {
    const client = rpcClient({ ok: true });
    const repo = new SupabaseContextRepository(client);

    await repo.resolveContext(contextId, { id: userId }, { agent_name: "codex" });

    expect(client.rpc).toHaveBeenCalledWith("neptune_resolve_context", {
      p_actor_user_id: userId,
      p_context_id: contextId,
      p_agent_name: "codex",
      p_note: null
    });
  });
});
