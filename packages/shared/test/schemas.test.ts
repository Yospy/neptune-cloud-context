import { describe, expect, it } from "vitest";
import {
  createOrgRequestSchema,
  createContextRequestSchema,
  createProjectRequestSchema,
  errorCodes,
  markContextReferencedRequestSchema,
  relevantContextQuerySchema
} from "../src/index.js";

const projectId = "11111111-1111-4111-8111-111111111111";

describe("shared schemas", () => {
  it("validates a create context request with defaults", () => {
    const parsed = createContextRequestSchema.parse({
      project_id: projectId,
      title: "Auth Contract",
      summary: "Login request and response contract.",
      content_md: "# Auth Contract",
      source_workstream: "frontend",
      target_workstreams: ["backend"],
      domain: "auth",
      context_type: "ui_contract"
    });

    expect(parsed.priority).toBe("normal");
    expect(parsed.code_areas).toEqual([]);
    expect(parsed.tags).toEqual([]);
  });

  it("validates project index context routing", () => {
    const parsed = createContextRequestSchema.parse({
      project_id: projectId,
      title: "Project Index",
      summary: "Fast map of project context records.",
      content_md: "# Project Index\n\nRead first:\n- ctx_123: Overview",
      source_workstream: "general",
      target_workstreams: ["general"],
      domain: "general",
      context_type: "project_index",
      priority: "high"
    });

    expect(parsed.context_type).toBe("project_index");
    expect(parsed.target_workstreams).toEqual(["general"]);
    expect(parsed.priority).toBe("high");
  });

  it("rejects invalid routing metadata", () => {
    const result = createContextRequestSchema.safeParse({
      project_id: projectId,
      title: "Bad",
      summary: "Bad",
      content_md: "# Bad",
      source_workstream: "sales",
      target_workstreams: ["backend"],
      domain: "auth",
      context_type: "ui_contract"
    });

    expect(result.success).toBe(false);
  });

  it("coerces relevant context query values", () => {
    const parsed = relevantContextQuerySchema.parse({
      project_id: projectId,
      target_workstream: "backend",
      unread_only: "true",
      limit: "20"
    });

    expect(parsed.unread_only).toBe(true);
    expect(parsed.limit).toBe(20);
  });

  it("validates project index relevant context queries", () => {
    const parsed = relevantContextQuerySchema.parse({
      project_id: projectId,
      target_workstream: "general",
      context_type: "project_index",
      limit: "1"
    });

    expect(parsed.context_type).toBe("project_index");
    expect(parsed.limit).toBe(1);
  });

  it("exports stable error codes", () => {
    expect(errorCodes).toContain("AUTH_REQUIRED");
    expect(errorCodes).toContain("ORG_NOT_FOUND");
    expect(errorCodes).toContain("PROJECT_ACCESS_DENIED");
    expect(errorCodes).toContain("PROJECT_NOT_FOUND");
    expect(errorCodes).toContain("VALIDATION_FAILED");
  });

  it("validates org and project bootstrap payloads", () => {
    expect(createOrgRequestSchema.parse({ slug: "acme-tools", name: "Acme Tools" })).toEqual({
      slug: "acme-tools",
      name: "Acme Tools"
    });
    expect(
      createProjectRequestSchema.parse({
        org_id: projectId,
        slug: "checkout",
        name: "Checkout"
      })
    ).toMatchObject({ default_workstream: "general" });
  });

  it("validates context reference payload defaults", () => {
    const parsed = markContextReferencedRequestSchema.parse({
      repo_path: "packages/backend/src/app.ts"
    });

    expect(parsed.agent_name).toBe("neptune");
  });
});
