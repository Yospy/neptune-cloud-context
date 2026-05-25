import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProjectBinding, requireProjectBinding, writeProjectBinding } from "../src/config.js";

describe("SDK project binding", () => {
  it("returns null when a repo is not bound", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-binding-"));

    try {
      await expect(loadProjectBinding(dir)).resolves.toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes and reads a repo binding", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-binding-"));

    try {
      await writeProjectBinding(
        {
          org_slug: "acme",
          project_slug: "checkout",
          project_id: "22222222-2222-4222-8222-222222222222",
          default_workstream: "backend"
        },
        dir
      );

      await expect(loadProjectBinding(dir)).resolves.toEqual({
        org_slug: "acme",
        project_slug: "checkout",
        project_id: "22222222-2222-4222-8222-222222222222",
        default_workstream: "backend"
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("throws PROJECT_NOT_BOUND when a binding is required but missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-binding-"));

    try {
      await expect(requireProjectBinding(dir)).rejects.toMatchObject({
        code: "PROJECT_NOT_BOUND"
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
