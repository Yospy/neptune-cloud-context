import { describe, expect, it } from "vitest";
import { loadBackendDotEnv } from "../src/dotenv.js";

describe("loadBackendDotEnv", () => {
  it("loads without throwing when env files are present or absent", () => {
    expect(() => loadBackendDotEnv()).not.toThrow();
  });
});
