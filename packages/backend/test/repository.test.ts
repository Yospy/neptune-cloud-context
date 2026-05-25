import { describe, expect, it, vi } from "vitest";
import { SupabaseContextRepository } from "../src/repository.js";
import { createFakeSupabase } from "./fake-supabase.js";
import {
  baseTables,
  contextId,
  createContextInput,
  orgId,
  otherUserId,
  projectId,
  userId
} from "./helpers.js";

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

function rpcClient(data: unknown = { ok: true }, error: unknown = null) {
  return {
    from: vi.fn(),
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
    const client = rpcClient(receipt(1, true));
    const repo = new SupabaseContextRepository(client);

    const result = await repo.createContext(createContextInput(), { id: userId });

    expect(result.changed).toBe(true);
    expect(result.receipt.version).toBe(1);
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
    const client = rpcClient(receipt(1, false));
    const repo = new SupabaseContextRepository(client);

    const result = await repo.createContext(createContextInput(), { id: userId });

    expect(result.changed).toBe(false);
    expect(result.receipt.version).toBe(1);
  });

  it("returns changed context receipts from the upsert RPC", async () => {
    const client = rpcClient(receipt(2, true));
    const repo = new SupabaseContextRepository(client);

    const result = await repo.createContext(
      createContextInput({ content_md: "# Auth UI Login Contract\n\nChanged." }),
      { id: userId }
    );

    expect(result.changed).toBe(true);
    expect(result.receipt.version).toBe(2);
  });

  it("maps RPC access errors to deterministic app errors", async () => {
    const client = rpcClient(null, { message: "PROJECT_ACCESS_DENIED" });
    const repo = new SupabaseContextRepository(client);

    await expect(repo.createContext(createContextInput(), { id: userId })).rejects.toMatchObject({
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
