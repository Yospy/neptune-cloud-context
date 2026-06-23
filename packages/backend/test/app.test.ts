import { describe, expect, it, vi } from "vitest";
import { contextPayloadLimits } from "neptune-context-shared";
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
  const userProfile = {
    id: userId,
    email: "user@example.com",
    display_name: "Test User",
    avatar_url: "https://example.com/avatar.png",
    provider: "github",
    last_seen_at: "2026-05-16T12:00:00.000Z",
    created_at: "2026-05-16T12:00:00.000Z",
    updated_at: "2026-05-16T12:00:00.000Z"
  };

  return {
    upsertUserProfile: vi.fn(async () => undefined),
    getMe: vi.fn(async () => ({
      ok: true,
      user: userProfile,
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
        content_hash: "sha256:test",
        created_by_user: userProfile,
        updated_by_user: userProfile
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

function testRateLimit(name: string, limit = 1, now = () => 1_000) {
  return {
    rule: { name, limit, windowMs: 60_000 },
    store: new Map(),
    now
  };
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

  it("rate limits invalid bearer attempts before Supabase auth verification", async () => {
    const auth = authClient(null);
    const app = createApp({
      authClient: auth,
      repository: repository(),
      rateLimits: {
        preAuthProtectedRoute: testRateLimit("test-pre-auth")
      }
    });

    const first = await app.request("/me", {
      headers: { Authorization: "Bearer invalid-token", "X-Forwarded-For": "203.0.113.10" }
    });
    const second = await app.request("/me", {
      headers: { Authorization: "Bearer invalid-token", "X-Forwarded-For": "203.0.113.10" }
    });

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("60");
    expect(await second.json()).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED" }
    });
    expect(auth.auth.getUser).toHaveBeenCalledTimes(1);
  });

  it("keys pre-auth rate limits by forwarded client address", async () => {
    const auth = authClient(null);
    const app = createApp({
      authClient: auth,
      repository: repository(),
      rateLimits: {
        preAuthProtectedRoute: testRateLimit("test-pre-auth-forwarded")
      }
    });

    const firstClient = await app.request("/me", {
      headers: { Authorization: "Bearer invalid-token", "X-Forwarded-For": "203.0.113.10" }
    });
    const secondClient = await app.request("/me", {
      headers: { Authorization: "Bearer invalid-token", "X-Forwarded-For": "203.0.113.11" }
    });
    const firstClientAgain = await app.request("/me", {
      headers: { Authorization: "Bearer invalid-token", "X-Forwarded-For": "203.0.113.10" }
    });

    expect(firstClient.status).toBe(401);
    expect(secondClient.status).toBe(401);
    expect(firstClientAgain.status).toBe(429);
    expect(auth.auth.getUser).toHaveBeenCalledTimes(2);
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

  it("rejects oversized context uploads before repository writes", async () => {
    const repo = repository();
    const app = createApp({ authClient: authClient(), repository: repo });
    const response = await app.request("/contexts", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify(
        createContextInput({
          content_md: "x".repeat(contextPayloadLimits.contentMdMax + 1)
        })
      )
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" }
    });
    expect(repo.createContext).not.toHaveBeenCalled();
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

  it("rate limits context creation", async () => {
    const repo = repository();
    const app = createApp({
      authClient: authClient(),
      repository: repo,
      rateLimits: {
        protectedRoute: testRateLimit("test-protected-create", 100),
        createContext: testRateLimit("test-create-context")
      }
    });

    const first = await app.request("/contexts", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify(createContextInput())
    });
    const second = await app.request("/contexts", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify(createContextInput())
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("60");
    expect(await second.json()).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED" }
    });
    expect(repo.createContext).toHaveBeenCalledTimes(1);
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

  it("rate limits auth-protected routes generally", async () => {
    let now = 1_000;
    const app = createApp({
      authClient: authClient(),
      repository: repository(),
      rateLimits: {
        protectedRoute: testRateLimit("test-protected", 1, () => now)
      }
    });

    const first = await app.request("/me", {
      headers: { Authorization: "Bearer token" }
    });
    const second = await app.request("/me", {
      headers: { Authorization: "Bearer token" }
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("60");
    expect(await second.json()).toMatchObject({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        details: {
          limit: 1,
          window_ms: 60_000,
          retry_after_seconds: 60
        }
      }
    });

    now = 61_001;
    const reset = await app.request("/orgs", {
      headers: { Authorization: "Bearer token" }
    });

    expect(reset.status).toBe(200);
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

  it("rate limits relevant context listing", async () => {
    const repo = repository();
    const app = createApp({
      authClient: authClient(),
      repository: repo,
      rateLimits: {
        protectedRoute: testRateLimit("test-protected-relevant", 100),
        relevantContext: testRateLimit("test-relevant-context")
      }
    });
    const path = `/contexts/relevant?project_id=${projectId}&target_workstream=backend`;

    const first = await app.request(path, {
      headers: { Authorization: "Bearer token" }
    });
    const second = await app.request(path, {
      headers: { Authorization: "Bearer token" }
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED" }
    });
    expect(repo.listRelevantContext).toHaveBeenCalledTimes(1);
  });

  it("rate limits direct context reads", async () => {
    const repo = repository();
    const app = createApp({
      authClient: authClient(),
      repository: repo,
      rateLimits: {
        protectedRoute: testRateLimit("test-protected-get", 100),
        getContext: testRateLimit("test-get-context")
      }
    });

    const first = await app.request(`/contexts/${contextId}`, {
      headers: { Authorization: "Bearer token" }
    });
    const second = await app.request(`/contexts/${contextId}`, {
      headers: { Authorization: "Bearer token" }
    });

    expect(first.status).toBe(404);
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED" }
    });
    expect(repo.getContext).toHaveBeenCalledTimes(1);
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
