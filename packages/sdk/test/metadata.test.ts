import { describe, expect, it } from "vitest";
import { createContextRequestSchema } from "neptune-context-shared";
import { inferContextMetadata } from "../src/metadata.js";

describe("SDK context metadata inference", () => {
  it("infers title from first H1 and summary from first paragraph", () => {
    const metadata = inferContextMetadata({
      markdown: "# Auth Login Contract\n\nFrontend login posts credentials and expects access tokens.",
      filePath: "src/features/auth/LoginForm.tsx"
    });

    expect(metadata.title).toBe("Auth Login Contract");
    expect(metadata.summary).toBe("Frontend login posts credentials and expects access tokens.");
    expect(metadata.domain).toBe("auth");
    expect(metadata.context_type).toBe("ui_contract");
  });

  it("infers source and target workstreams from hint and path", () => {
    const metadata = inferContextMetadata({
      markdown: "# API Contract\n\nBackend endpoint response for the frontend checkout form.",
      filePath: "packages/backend/src/routes/checkout.ts",
      hint: "backend contract for frontend"
    });

    expect(metadata.source_workstream).toBe("backend");
    expect(metadata.target_workstreams).toContain("frontend");
    expect(metadata.code_areas).toContain("routes");
    expect(metadata.repo_paths).toEqual(["packages/backend/src/routes/checkout.ts"]);
  });

  it("uses project binding default workstream when text is generic", () => {
    const metadata = inferContextMetadata({
      markdown: "# Notes\n\nSome implementation details.",
      projectBinding: {
        org_slug: "acme",
        project_slug: "checkout",
        project_id: "22222222-2222-4222-8222-222222222222",
        default_workstream: "docs"
      }
    });

    expect(metadata.source_workstream).toBe("docs");
    expect(metadata.confidence_score).toBeLessThan(0.9);
  });

  it("returns low-confidence general metadata for sparse markdown", () => {
    const metadata = inferContextMetadata({ markdown: "tiny" });

    expect(metadata.title).toBe("tiny");
    expect(metadata.domain).toBe("general");
    expect(metadata.context_type).toBe("general_context");
    expect(metadata.source_workstream).toBe("general");
    expect(metadata.inference_notes).toContain("low confidence");
  });

  it("infers fixed routing metadata for project indexes", () => {
    const metadata = inferContextMetadata({
      markdown: "# Project Index\n\nRead first:\n- ctx_123: Project overview",
      filePath: "context/project-index.md"
    });

    expect(metadata.title).toBe("Project Index");
    expect(metadata.domain).toBe("general");
    expect(metadata.context_type).toBe("project_index");
    expect(metadata.source_workstream).toBe("general");
    expect(metadata.target_workstreams).toEqual(["general"]);
    expect(metadata.priority).toBe("high");
    expect(metadata.confidence_score).toBe(0.95);
  });

  it("produces createContext-compatible metadata fields", () => {
    const metadata = inferContextMetadata({
      markdown: "# Database Migration\n\nPostgres schema migration for auth sessions.",
      filePath: "supabase/migrations/001_auth_sessions.sql"
    });

    expect(
      createContextRequestSchema.safeParse({
        project_id: "22222222-2222-4222-8222-222222222222",
        content_md: "# Database Migration\n\nPostgres schema migration for auth sessions.",
        ...metadata
      }).success
    ).toBe(true);
  });
});
