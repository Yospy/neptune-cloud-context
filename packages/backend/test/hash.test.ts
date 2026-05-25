import { describe, expect, it } from "vitest";
import { hashMarkdown } from "../src/hash.js";

describe("hashMarkdown", () => {
  it("returns stable sha256 content hashes", () => {
    expect(hashMarkdown("# Hello")).toBe(
      "sha256:01c8de44e04d2f7a304f50963545a2aff58c33e9c44a1f33fdcb978fb224cb74"
    );
  });
});
