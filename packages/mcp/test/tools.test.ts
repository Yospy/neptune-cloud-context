import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import type { NeptuneClient } from "neptune-context";
import { createNeptuneMcpServer } from "../src/server.js";
import {
  NEPTUNE_TOOL_NAMES,
  callNeptuneTool,
  toolDefinitions,
  type NeptuneToolDeps
} from "../src/tools.js";

function createMockDeps(): NeptuneToolDeps {
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
        content_hash: "sha256:test"
      }
    })),
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

describe("Neptune MCP tools", () => {
  it("defines the exact V1 tool names", () => {
    expect(toolDefinitions.map((tool) => tool.name)).toEqual([...NEPTUNE_TOOL_NAMES]);
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

  it("returns MCP tool errors for invalid input", async () => {
    const result = await callNeptuneTool("get_context", { context_id: "not-a-uuid" }, createMockDeps());

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" }
    });
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
