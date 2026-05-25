import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { createApp } from "../../src/app.js";
import { loadBackendDotEnv } from "../../src/dotenv.js";
import { loadEnv } from "../../src/env.js";
import { SupabaseContextRepository } from "../../src/repository.js";
import { createSupabaseAdminClient, createSupabaseAuthClient } from "../../src/supabase.js";

const runIntegration =
  process.env.NEPTUNE_INTEGRATION_TESTS === "true" ? describe : describe.skip;

runIntegration("real Supabase lifecycle", () => {
  let app: ReturnType<typeof createApp>;
  let token: string;
  let orgId: string | undefined;
  let projectId: string;
  let contextId: string;
  let adminClient: ReturnType<typeof createSupabaseAdminClient>;

  beforeAll(async () => {
    loadBackendDotEnv();
    const env = loadEnv();
    const email = process.env.NEPTUNE_TEST_EMAIL;
    const password = process.env.NEPTUNE_TEST_PASSWORD;

    if (!email || !password) {
      throw new Error("NEPTUNE_TEST_EMAIL and NEPTUNE_TEST_PASSWORD are required.");
    }

    const authClient = createSupabaseAuthClient(env);
    adminClient = createSupabaseAdminClient(env);
    app = createApp({
      authClient,
      repository: new SupabaseContextRepository(adminClient)
    });

    const { data, error } = await authClient.auth.signInWithPassword({ email, password });

    if (error || !data.session?.access_token) {
      throw new Error(`Failed to sign in integration test user: ${error?.message ?? "no token"}`);
    }

    token = data.session.access_token;
  });

  afterAll(async () => {
    if (orgId) {
      await adminClient.from("orgs").delete().eq("id", orgId);
    }
  });

  async function request(path: string, init: RequestInit = {}) {
    return app.request(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers
      }
    });
  }

  it("runs the full backend lifecycle against real Supabase", async () => {
    const suffix = Date.now();
    const orgResponse = await request("/orgs", {
      method: "POST",
      body: JSON.stringify({
        slug: `it-org-${suffix}`,
        name: `Integration Org ${suffix}`
      })
    });

    expect(orgResponse.status).toBe(200);
    const orgBody = await orgResponse.json();
    expect(orgBody.ok).toBe(true);
    orgId = orgBody.org.id;

    const projectResponse = await request("/projects", {
      method: "POST",
      body: JSON.stringify({
        org_id: orgId,
        slug: `it-project-${suffix}`,
        name: `Integration Project ${suffix}`,
        default_workstream: "backend"
      })
    });

    expect(projectResponse.status).toBe(200);
    const projectBody = await projectResponse.json();
    expect(projectBody.ok).toBe(true);
    projectId = projectBody.project.id;

    const createPayload = {
      project_id: projectId,
      title: `Integration Auth Contract ${suffix}`,
      summary: "Integration test context.",
      content_md: "# Integration Auth Contract\n\nInitial markdown.",
      source_workstream: "frontend",
      target_workstreams: ["backend"],
      domain: "auth",
      code_areas: ["login"],
      context_type: "ui_contract",
      priority: "normal",
      tags: ["integration"],
      repo_paths: ["packages/backend/test/integration/real-supabase.test.ts"],
      related_files: []
    };

    const createdResponse = await request("/contexts", {
      method: "POST",
      body: JSON.stringify(createPayload)
    });

    expect(createdResponse.status).toBe(200);
    const createdBody = await createdResponse.json();
    expect(createdBody.changed).toBe(true);
    expect(createdBody.receipt.version).toBe(1);
    contextId = createdBody.receipt.context_id;

    const duplicateResponse = await request("/contexts", {
      method: "POST",
      body: JSON.stringify(createPayload)
    });
    const duplicateBody = await duplicateResponse.json();
    expect(duplicateResponse.status).toBe(200);
    expect(duplicateBody.changed).toBe(false);
    expect(duplicateBody.receipt.version).toBe(1);

    const changedResponse = await request("/contexts", {
      method: "POST",
      body: JSON.stringify({
        ...createPayload,
        content_md: "# Integration Auth Contract\n\nChanged markdown."
      })
    });
    const changedBody = await changedResponse.json();
    expect(changedResponse.status).toBe(200);
    expect(changedBody.changed).toBe(true);
    expect(changedBody.receipt.version).toBe(2);

    const relevantResponse = await request(
      `/contexts/relevant?project_id=${projectId}&target_workstream=backend&domain=auth`
    );
    const relevantBody = await relevantResponse.json();
    expect(relevantResponse.status).toBe(200);
    expect(relevantBody.contexts.some((context: { id: string }) => context.id === contextId)).toBe(
      true
    );

    const getResponse = await request(`/contexts/${contextId}`);
    const getBody = await getResponse.json();
    expect(getResponse.status).toBe(200);
    expect(getBody.context.content_md).toContain("Changed markdown.");

    const readResponse = await request(`/contexts/${contextId}/read`, {
      method: "POST",
      body: JSON.stringify({ agent_name: "integration" })
    });
    expect(readResponse.status).toBe(200);

    const unreadResponse = await request(
      `/contexts/relevant?project_id=${projectId}&target_workstream=backend&unread_only=true`
    );
    const unreadBody = await unreadResponse.json();
    expect(unreadBody.contexts.some((context: { id: string }) => context.id === contextId)).toBe(
      false
    );

    const referenceResponse = await request(`/contexts/${contextId}/reference`, {
      method: "POST",
      body: JSON.stringify({
        agent_name: "integration",
        repo_path: "packages/backend/src/app.ts",
        note: "Verified in integration test."
      })
    });
    expect(referenceResponse.status).toBe(200);

    const resolveResponse = await request(`/contexts/${contextId}/resolve`, {
      method: "POST",
      body: JSON.stringify({
        agent_name: "integration",
        note: "Integration test completed."
      })
    });
    expect(resolveResponse.status).toBe(200);

    const activeAfterResolveResponse = await request(
      `/contexts/relevant?project_id=${projectId}&target_workstream=backend&domain=auth`
    );
    const activeAfterResolveBody = await activeAfterResolveResponse.json();
    expect(
      activeAfterResolveBody.contexts.some((context: { id: string }) => context.id === contextId)
    ).toBe(false);
  });
});
