import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { AppError } from "../src/app-error.js";
import { createContextInput, contextId, orgId, projectId, userId } from "./helpers.js";

function authClient(
  user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  } | null = { id: userId }
) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
        error: user ? null : new Error("invalid")
      }))
    }
  };
}

function repository() {
  return {
    upsertUserProfile: vi.fn(async () => undefined),
    getMe: vi.fn(async () => ({
      ok: true,
      user: {
        id: userId,
        email: "user@example.com",
        display_name: "Test User",
        avatar_url: "https://example.com/avatar.png",
        provider: "github",
        last_seen_at: "2026-05-16T12:00:00.000Z",
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: "2026-05-16T12:00:00.000Z"
      },
      orgs: [],
      projects: []
    })),
    listOrgs: vi.fn(async () => ({
      ok: true,
      orgs: []
    })),
    createOrg: vi.fn(async () => ({
      ok: true,
      org: {
        id: orgId,
        slug: "acme",
        name: "Acme",
        role: "owner",
        created_at: "2026-05-16T12:00:00.000Z"
      }
    })),
    listOrgMembers: vi.fn(async () => ({
      ok: true,
      members: []
    })),
    listProjects: vi.fn(async () => ({
      ok: true,
      projects: []
    })),
    createProject: vi.fn(async () => ({
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
    })),
    listProjectMembers: vi.fn(async () => ({
      ok: true,
      members: []
    })),
    createContext: vi.fn(async () => ({
      ok: true,
      changed: true,
      receipt: {
        context_id: contextId,
        org: "acme",
        project: "checkout",
        title: "Auth UI Login Contract",
        source_workstream: "frontend",
        target_workstreams: ["backend"],
        domain: "auth",
        code_areas: ["login"],
        context_type: "ui_contract",
        status: "active",
        version: 1,
        created_at: "2026-05-16T12:00:00.000Z",
        content_hash: "sha256:test"
      }
    })),
    listRelevantContext: vi.fn(async () => []),
    getContext: vi.fn(async () => {
      throw new AppError("CONTEXT_NOT_FOUND", "Context not found.");
    }),
    markContextRead: vi.fn(async () => undefined),
    markContextReferenced: vi.fn(async () => undefined),
    resolveContext: vi.fn(async () => undefined)
  };
}

function logger() {
  const root = {
    child: vi.fn(() => root),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
  return root;
}

describe("createApp", () => {
  it("serves health without auth", async () => {
    const logs = logger();
    const app = createApp({
      authClient: authClient(),
      repository: repository(),
      logger: logs as never
    });
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: "neptune-backend"
    });
    expect(logs.info).not.toHaveBeenCalled();
    expect(logs.warn).not.toHaveBeenCalled();
    expect(logs.error).not.toHaveBeenCalled();
  });

  it("rejects protected routes without bearer auth", async () => {
    const logs = logger();
    const app = createApp({
      authClient: authClient(),
      repository: repository(),
      logger: logs as never
    });
    const response = await app.request("/contexts/relevant");

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "AUTH_REQUIRED" }
    });
    expect(logs.warn).toHaveBeenCalledTimes(1);
    expect(logs.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "http_request",
        method: "GET",
        path: "/contexts/relevant",
        status: 401,
        error_code: "AUTH_REQUIRED"
      }),
      "http_request_failed"
    );
  });

  it("returns deterministic validation errors", async () => {
    const app = createApp({ authClient: authClient(), repository: repository() });
    const response = await app.request("/contexts", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ ...createContextInput(), source_workstream: "sales" })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" }
    });
  });

  it("creates context with an authenticated user", async () => {
    const repo = repository();
    const app = createApp({ authClient: authClient(), repository: repo });
    const response = await app.request("/contexts", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify(createContextInput())
    });

    expect(response.status).toBe(200);
    expect(repo.upsertUserProfile).toHaveBeenCalledWith(expect.objectContaining({ id: userId }));
    expect(repo.createContext).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Auth UI Login Contract" }),
      expect.objectContaining({ id: userId })
    );
  });

  it("maps Supabase auth metadata and returns /me", async () => {
    const repo = repository();
    const app = createApp({
      authClient: authClient({
        id: userId,
        email: "user@example.com",
        user_metadata: {
          name: "Test User",
          avatar_url: "https://example.com/avatar.png"
        },
        app_metadata: {
          provider: "github"
        }
      }),
      repository: repo
    });
    const response = await app.request("/me", {
      headers: { Authorization: "Bearer token" }
    });

    expect(response.status).toBe(200);
    expect(repo.upsertUserProfile).toHaveBeenCalledWith({
      id: userId,
      email: "user@example.com",
      display_name: "Test User",
      avatar_url: "https://example.com/avatar.png",
      provider: "github"
    });
    expect(repo.getMe).toHaveBeenCalledWith(expect.objectContaining({ provider: "github" }));
    expect(await response.json()).toMatchObject({ ok: true, user: { id: userId } });
  });

  it("creates orgs with an authenticated user", async () => {
    const repo = repository();
    const app = createApp({ authClient: authClient(), repository: repo });
    const response = await app.request("/orgs", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "acme", name: "Acme" })
    });

    expect(response.status).toBe(200);
    expect(repo.createOrg).toHaveBeenCalledWith(
      { slug: "acme", name: "Acme" },
      expect.objectContaining({ id: userId })
    );
  });

  it("returns 409 conflict for duplicate org slugs", async () => {
    const repo = repository();
    vi.mocked(repo.createOrg).mockRejectedValueOnce(
      new AppError("CONFLICT", "Resource already exists.")
    );
    const app = createApp({ authClient: authClient(), repository: repo });
    const response = await app.request("/orgs", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "acme", name: "Acme" })
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "Resource already exists." }
    });
  });

  it("lists org members with an authenticated user", async () => {
    const repo = repository();
    const app = createApp({ authClient: authClient(), repository: repo });
    const response = await app.request(`/orgs/${orgId}/members`, {
      headers: { Authorization: "Bearer token" }
    });

    expect(response.status).toBe(200);
    expect(repo.listOrgMembers).toHaveBeenCalledWith(orgId, expect.objectContaining({ id: userId }));
  });

  it("creates projects with an authenticated user", async () => {
    const repo = repository();
    const app = createApp({ authClient: authClient(), repository: repo });
    const response = await app.request("/projects", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: orgId, slug: "checkout", name: "Checkout" })
    });

    expect(response.status).toBe(200);
    expect(repo.createProject).toHaveBeenCalledWith(
      {
        org_id: orgId,
        slug: "checkout",
        name: "Checkout",
        default_workstream: "general"
      },
      expect.objectContaining({ id: userId })
    );
  });

  it("returns 409 conflict for duplicate project slugs", async () => {
    const repo = repository();
    vi.mocked(repo.createProject).mockRejectedValueOnce(
      new AppError("CONFLICT", "Resource already exists.")
    );
    const app = createApp({ authClient: authClient(), repository: repo });
    const response = await app.request("/projects", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: orgId, slug: "checkout", name: "Checkout" })
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "Resource already exists." }
    });
  });

  it("lists project members with an authenticated user", async () => {
    const repo = repository();
    const app = createApp({ authClient: authClient(), repository: repo });
    const response = await app.request(`/projects/${projectId}/members`, {
      headers: { Authorization: "Bearer token" }
    });

    expect(response.status).toBe(200);
    expect(repo.listProjectMembers).toHaveBeenCalledWith(
      projectId,
      expect.objectContaining({ id: userId })
    );
  });

  it("marks context read with default agent name when body is empty", async () => {
    const repo = repository();
    const app = createApp({ authClient: authClient(), repository: repo });
    const response = await app.request(`/contexts/${contextId}/read`, {
      method: "POST",
      headers: { Authorization: "Bearer token" }
    });

    expect(response.status).toBe(200);
    expect(repo.markContextRead).toHaveBeenCalledWith(
      contextId,
      expect.objectContaining({ id: userId }),
      "neptune"
    );
  });

  it("marks context referenced with default agent name", async () => {
    const repo = repository();
    const app = createApp({ authClient: authClient(), repository: repo });
    const response = await app.request(`/contexts/${contextId}/reference`, {
      method: "POST",
      headers: { Authorization: "Bearer token" }
    });

    expect(response.status).toBe(200);
    expect(repo.markContextReferenced).toHaveBeenCalledWith(
      contextId,
      expect.objectContaining({ id: userId }),
      {
        agent_name: "neptune"
      }
    );
  });

  it("resolves context with default agent name", async () => {
    const repo = repository();
    const app = createApp({ authClient: authClient(), repository: repo });
    const response = await app.request(`/contexts/${contextId}/resolve`, {
      method: "POST",
      headers: { Authorization: "Bearer token" }
    });

    expect(response.status).toBe(200);
    expect(repo.resolveContext).toHaveBeenCalledWith(
      contextId,
      expect.objectContaining({ id: userId }),
      {
        agent_name: "neptune"
      }
    );
  });
});
