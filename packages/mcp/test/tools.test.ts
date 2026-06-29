import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import type { NeptuneClient } from "neptune-context";
import { contextPayloadLimits } from "neptune-context-shared";
import { createNeptuneMcpServer } from "../src/server.js";
import {
  NEPTUNE_TOOL_NAMES,
  callNeptuneTool,
  toolDefinitions,
  type NeptuneToolDeps
} from "../src/tools.js";

function createMockDeps(): NeptuneToolDeps {
  const userProfile = {
    id: "22222222-2222-4222-8222-222222222222",
    email: "user@example.com",
    display_name: "Test User",
    avatar_url: null,
    provider: "github",
    last_seen_at: "2026-05-18T00:00:00.000Z",
    created_at: "2026-05-18T00:00:00.000Z",
    updated_at: "2026-05-18T00:00:00.000Z"
  };
  const client = {
    createContext: vi.fn(async () => ({
      ok: true,
      changed: true,
      receipt: {
        context_id: "44444444-4444-4444-8444-444444444444",
        org: "acme",
        project: "checkout",
        title: "Auth Context",
        source_workstream: "frontend",
        target_workstreams: ["backend"],
        domain: "auth",
        code_areas: ["login"],
        context_type: "ui_contract",
        status: "active",
        version: 1,
        created_at: "2026-05-18T00:00:00.000Z",
        content_hash: "sha256:test",
        created_by_user: userProfile,
        updated_by_user: userProfile
      }
    })),
    retrieveContext: vi.fn(async () => ({ ok: true, contexts: [] })),
    listRelevantContext: vi.fn(async () => ({ ok: true, contexts: [] })),
    getContext: vi.fn(async () => ({ ok: true, context: { id: "ctx-1" } })),
    markContextReferenced: vi.fn(async () => ({ ok: true }))
  } as unknown as NeptuneClient;

  return {
    client,
    cwd: "/tmp/repo",
    requireProjectBinding: vi.fn(async () => ({
      org_slug: "acme",
      project_slug: "checkout",
      project_id: "22222222-2222-4222-8222-222222222222",
      default_workstream: "backend" as const
    }))
  };
}

function createContextArgs(overrides: Record<string, unknown> = {}) {
  return {
    project_id: "22222222-2222-4222-8222-222222222222",
    title: "Auth Context",
    summary: "Frontend to backend auth API.",
    content_md: "# Auth Context\n\nFrontend to backend auth API.",
    source_workstream: "frontend",
    target_workstreams: ["backend"],
    domain: "auth",
    code_areas: ["login"],
    context_type: "api_contract",
    tags: ["auth"],
    repo_paths: [],
    related_files: [],
    ...overrides
  };
}

function oversizedString(maxLength: number) {
  return "x".repeat(maxLength + 1);
}

function oversizedArray(maxItems: number, value: string) {
  return Array.from({ length: maxItems + 1 }, () => value);
}

describe("Neptune MCP tools", () => {
  it("defines the exact V1 tool names", () => {
    expect(toolDefinitions.map((tool) => tool.name)).toEqual([...NEPTUNE_TOOL_NAMES]);
  });

  it("maps smart retrieve_context to the SDK client", async () => {
    const deps = createMockDeps();
    const result = await callNeptuneTool(
      "retrieve_context",
      {
        project_id: "22222222-2222-4222-8222-222222222222",
        intent: "latest uploaded context",
        target_workstream: "backend",
        limit: 5
      },
      deps
    );

    expect(result.isError).toBeUndefined();
    expect(deps.client?.retrieveContext).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "22222222-2222-4222-8222-222222222222",
        intent: "latest uploaded context",
        mode: "smart",
        target_workstream: "backend",
        limit: 5
      })
    );
  });

  it("maps require_project_binding to the SDK project binding helper", async () => {
    const deps = createMockDeps();
    const result = await callNeptuneTool(
      "require_project_binding",
      { cwd: "/tmp/repo" },
      deps
    );

    expect(result.isError).toBeUndefined();
    expect(deps.requireProjectBinding).toHaveBeenCalledWith("/tmp/repo");
    expect(result.structuredContent).toMatchObject({ ok: true });
  });

  it("maps create_context to the SDK client", async () => {
    const deps = createMockDeps();
    const result = await callNeptuneTool(
      "create_context",
      {
        project_id: "22222222-2222-4222-8222-222222222222",
        title: "Auth Context",
        summary: "Frontend to backend auth API.",
        content_md: "# Auth Context\n\nFrontend to backend auth API.",
        source_workstream: "frontend",
        target_workstreams: ["backend"],
        domain: "auth",
        code_areas: ["login"],
        context_type: "api_contract",
        tags: ["auth"],
        repo_paths: [],
        related_files: []
      },
      deps
    );

    expect(result.isError).toBeUndefined();
    expect(deps.client?.createContext).toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({ ok: true });
  });

  it("accepts project_index routing for create_context", async () => {
    const deps = createMockDeps();
    const result = await callNeptuneTool(
      "create_context",
      {
        project_id: "22222222-2222-4222-8222-222222222222",
        title: "Project Index",
        summary: "Fast map of project context records.",
        content_md: "# Project Index\n\nRead first:\n- ctx_123: Overview",
        source_workstream: "general",
        target_workstreams: ["general"],
        domain: "general",
        context_type: "project_index",
        priority: "high",
        tags: ["project-index"],
        repo_paths: [],
        related_files: []
      },
      deps
    );

    expect(result.isError).toBeUndefined();
    expect(deps.client?.createContext).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Project Index",
        context_type: "project_index",
        target_workstreams: ["general"],
        priority: "high"
      })
    );
  });

  it("accepts project_index routing for list_relevant_context", async () => {
    const deps = createMockDeps();
    const result = await callNeptuneTool(
      "list_relevant_context",
      {
        project_id: "22222222-2222-4222-8222-222222222222",
        target_workstream: "general",
        context_type: "project_index",
        limit: 1
      },
      deps
    );

    expect(result.isError).toBeUndefined();
    expect(deps.client?.listRelevantContext).toHaveBeenCalledWith(
      expect.objectContaining({
        target_workstream: "general",
        context_type: "project_index",
        limit: 1
      })
    );
  });

  it("accepts agent intent query filters for list_relevant_context", async () => {
    const deps = createMockDeps();
    const result = await callNeptuneTool(
      "list_relevant_context",
      {
        project_id: "22222222-2222-4222-8222-222222222222",
        target_workstream: "backend",
        query: "latest auth login API contract",
        updated_after: "2026-06-23T10:00:00.000Z",
        limit: 5
      },
      deps
    );

    expect(result.isError).toBeUndefined();
    expect(deps.client?.listRelevantContext).toHaveBeenCalledWith(
      expect.objectContaining({
        target_workstream: "backend",
        query: "latest auth login API contract",
        updated_after: "2026-06-23T10:00:00.000Z",
        limit: 5
      })
    );
  });

  it("returns MCP tool errors for invalid input", async () => {
    const result = await callNeptuneTool("get_context", { context_id: "not-a-uuid" }, createMockDeps());

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" }
    });
  });

  it.each([
    ["summary", { summary: oversizedString(contextPayloadLimits.summaryMax) }],
    ["content_md", { content_md: oversizedString(contextPayloadLimits.contentMdMax) }],
    [
      "target_workstreams",
      {
        target_workstreams: oversizedArray(
          contextPayloadLimits.targetWorkstreamsMax,
          "backend"
        )
      }
    ],
    ["code_areas count", { code_areas: oversizedArray(contextPayloadLimits.codeAreasMax, "login") }],
    ["code_areas item", { code_areas: [oversizedString(contextPayloadLimits.codeAreaMax)] }],
    ["tags count", { tags: oversizedArray(contextPayloadLimits.tagsMax, "auth") }],
    ["tags item", { tags: [oversizedString(contextPayloadLimits.tagMax)] }],
    ["repo_paths count", { repo_paths: oversizedArray(contextPayloadLimits.repoPathsMax, "src/a.ts") }],
    ["repo_paths item", { repo_paths: [oversizedString(contextPayloadLimits.repoPathMax)] }],
    [
      "related_files count",
      { related_files: oversizedArray(contextPayloadLimits.relatedFilesMax, "src/a.ts") }
    ],
    [
      "related_files item",
      { related_files: [oversizedString(contextPayloadLimits.relatedFileMax)] }
    ],
    [
      "inference_notes",
      { inference_notes: oversizedString(contextPayloadLimits.inferenceNotesMax) }
    ]
  ])("rejects oversized create_context %s before SDK calls", async (_name, overrides) => {
    const deps = createMockDeps();
    const result = await callNeptuneTool("create_context", createContextArgs(overrides), deps);

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" }
    });
    expect(deps.client?.createContext).not.toHaveBeenCalled();
  });

  it("normalizes SDK errors into MCP error results", async () => {
    const deps = createMockDeps();
    vi.mocked(deps.client!.listRelevantContext).mockRejectedValueOnce({
      name: "NeptuneSdkError",
      code: "AUTH_REQUIRED",
      message: "Not logged in.",
      status: 401
    });

    const result = await callNeptuneTool(
      "list_relevant_context",
      {
        project_id: "22222222-2222-4222-8222-222222222222",
        target_workstream: "backend"
      },
      deps
    );

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: false,
      error: { code: "AUTH_REQUIRED", status: 401 }
    });
  });

  it("propagates project access denials from SDK calls", async () => {
    const denied = {
      name: "NeptuneSdkError",
      code: "PROJECT_ACCESS_DENIED",
      message: "Project access denied.",
      status: 403
    };

    const listDeps = createMockDeps();
    vi.mocked(listDeps.client!.listRelevantContext).mockRejectedValueOnce(denied);
    await expect(
      callNeptuneTool(
        "list_relevant_context",
        {
          project_id: "77777777-7777-4777-8777-777777777777",
          target_workstream: "backend"
        },
        listDeps
      )
    ).resolves.toMatchObject({
      isError: true,
      structuredContent: { error: { code: "PROJECT_ACCESS_DENIED", status: 403 } }
    });

    const getDeps = createMockDeps();
    vi.mocked(getDeps.client!.getContext).mockRejectedValueOnce(denied);
    await expect(
      callNeptuneTool(
        "get_context",
        { context_id: "99999999-9999-4999-8999-999999999999" },
        getDeps
      )
    ).resolves.toMatchObject({
      isError: true,
      structuredContent: { error: { code: "PROJECT_ACCESS_DENIED", status: 403 } }
    });

    const createDeps = createMockDeps();
    vi.mocked(createDeps.client!.createContext).mockRejectedValueOnce(denied);
    await expect(
      callNeptuneTool(
        "create_context",
        {
          project_id: "77777777-7777-4777-8777-777777777777",
          title: "Foreign Auth Context",
          summary: "Context in a project the caller cannot access.",
          content_md: "# Foreign Auth Context\n\nPrivate to another project.",
          source_workstream: "frontend",
          target_workstreams: ["backend"],
          domain: "auth",
          code_areas: ["login"],
          context_type: "ui_contract",
          tags: [],
          repo_paths: [],
          related_files: []
        },
        createDeps
      )
    ).resolves.toMatchObject({
      isError: true,
      structuredContent: { error: { code: "PROJECT_ACCESS_DENIED", status: 403 } }
    });

    const referenceDeps = createMockDeps();
    vi.mocked(referenceDeps.client!.markContextReferenced).mockRejectedValueOnce(denied);
    await expect(
      callNeptuneTool(
        "mark_context_referenced",
        { context_id: "99999999-9999-4999-8999-999999999999" },
        referenceDeps
      )
    ).resolves.toMatchObject({
      isError: true,
      structuredContent: { error: { code: "PROJECT_ACCESS_DENIED", status: 403 } }
    });
  });

  it("propagates SDK conflict errors into MCP error results", async () => {
    const deps = createMockDeps();
    vi.mocked(deps.client!.createContext).mockRejectedValueOnce({
      name: "NeptuneSdkError",
      code: "CONFLICT",
      message: "Resource already exists.",
      status: 409
    });

    const result = await callNeptuneTool(
      "create_context",
      {
        project_id: "22222222-2222-4222-8222-222222222222",
        title: "Auth Context",
        summary: "Frontend to backend auth API.",
        content_md: "# Auth Context\n\nFrontend to backend auth API.",
        source_workstream: "frontend",
        target_workstreams: ["backend"],
        domain: "auth",
        code_areas: ["login"],
        context_type: "api_contract",
        tags: ["auth"],
        repo_paths: [],
        related_files: []
      },
      deps
    );

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", status: 409, message: "Resource already exists." }
    });
  });

  it("lists and calls tools through MCP in-memory transport", async () => {
    const deps = createMockDeps();
    const server = createNeptuneMcpServer(deps);
    const client = new Client({ name: "neptune-mcp-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual([...NEPTUNE_TOOL_NAMES]);

      const result = await client.callTool({ name: "require_project_binding", arguments: {} });
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({ ok: true });
      expect(deps.requireProjectBinding).toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });
});
