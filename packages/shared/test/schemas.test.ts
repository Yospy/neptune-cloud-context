import { describe, expect, it } from "vitest";
import {
  contextPayloadLimits,
  createOrgRequestSchema,
  createContextRequestSchema,
  createProjectRequestSchema,
  errorCodes,
  markContextReferencedRequestSchema,
  relevantContextQuerySchema,
  retrieveContextQuerySchema,
  updateContextAuthorNoteRequestSchema
} from "../src/index.js";

const projectId = "11111111-1111-4111-8111-111111111111";

function createContextPayload(overrides: Record<string, unknown> = {}) {
  return {
    project_id: projectId,
    title: "Auth Contract",
    summary: "Login request and response contract.",
    content_md: "# Auth Contract",
    source_workstream: "frontend",
    target_workstreams: ["backend"],
    domain: "auth",
    context_type: "ui_contract",
    ...overrides
  };
}

function oversizedString(maxLength: number) {
  return "x".repeat(maxLength + 1);
}

function oversizedArray(maxItems: number, value: string) {
  return Array.from({ length: maxItems + 1 }, () => value);
}

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

  it.each([
    ["summary", { summary: oversizedString(contextPayloadLimits.summaryMax) }],
    ["content_md", { content_md: oversizedString(contextPayloadLimits.contentMdMax) }],
    [
      "author_note_md",
      {
        author_note_md: oversizedString(contextPayloadLimits.authorNoteMax),
        author_note_source: "manual"
      }
    ],
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
  ])("rejects oversized create context %s", (_name, overrides) => {
    const result = createContextRequestSchema.safeParse(createContextPayload(overrides));

    expect(result.success).toBe(false);
  });

  it("validates create context author notes", () => {
    const parsed = createContextRequestSchema.parse(
      createContextPayload({
        author_note_md: "Canonical checkout handoff for backend.",
        author_note_source: "manual"
      })
    );

    expect(parsed.author_note_md).toBe("Canonical checkout handoff for backend.");
    expect(parsed.author_note_source).toBe("manual");
  });

  it.each([
    ["note without source", { author_note_md: "Canonical checkout handoff." }],
    ["source without note", { author_note_source: "agent_inferred" }],
    [
      "invalid source",
      { author_note_md: "Canonical checkout handoff.", author_note_source: "bot" }
    ]
  ])("rejects invalid create context author note %s", (_name, overrides) => {
    const result = createContextRequestSchema.safeParse(createContextPayload(overrides));

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

  it("validates agent intent relevant context queries", () => {
    const parsed = relevantContextQuerySchema.parse({
      project_id: projectId,
      target_workstream: "backend",
      query: "latest auth login API contract",
      updated_after: "2026-06-23T10:00:00.000Z",
      unread_only: "false",
      limit: "5"
    });

    expect(parsed.query).toBe("latest auth login API contract");
    expect(parsed.updated_after).toBe("2026-06-23T10:00:00.000Z");
    expect(parsed.unread_only).toBe(false);
    expect(parsed.limit).toBe(5);
  });

  it("validates smart context retrieval queries", () => {
    const parsed = retrieveContextQuerySchema.parse({
      project_id: projectId,
      intent: "latest uploaded context",
      target_workstream: "backend",
      context_type: "implementation_note",
      limit: "5"
    });

    expect(parsed).toMatchObject({
      project_id: projectId,
      intent: "latest uploaded context",
      mode: "smart",
      target_workstream: "backend",
      context_type: "implementation_note",
      limit: 5
    });
  });

  it("validates strict context retrieval mode", () => {
    const parsed = retrieveContextQuerySchema.parse({
      project_id: projectId,
      mode: "strict",
      domain: "release"
    });

    expect(parsed.mode).toBe("strict");
    expect(parsed.limit).toBe(10);
  });

  it("exports stable error codes", () => {
    expect(errorCodes).toContain("AUTH_REQUIRED");
    expect(errorCodes).toContain("ORG_NOT_FOUND");
    expect(errorCodes).toContain("PROJECT_ACCESS_DENIED");
    expect(errorCodes).toContain("PROJECT_NOT_FOUND");
    expect(errorCodes).toContain("AUTHOR_NOTE_ACCESS_DENIED");
    expect(errorCodes).toContain("VALIDATION_FAILED");
    expect(errorCodes).toContain("RATE_LIMITED");
  });

  it("validates author note update payloads", () => {
    expect(
      updateContextAuthorNoteRequestSchema.parse({
        author_note_md: "Use this as the canonical checkout contract.",
        author_note_source: "agent_inferred"
      })
    ).toEqual({
      author_note_md: "Use this as the canonical checkout contract.",
      author_note_source: "agent_inferred"
    });
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
