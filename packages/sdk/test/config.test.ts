import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getFileMode, loadConfig, writeConfig } from "../src/config.js";

describe("SDK config storage", () => {
  it("writes config as a private user file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-context-"));
    const configPath = join(dir, "home", ".neptune", "config.json");

    try {
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          auth: {
            accessToken: "access",
            refreshToken: "refresh",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1", email: "user@example.com" }
          }
        },
        configPath
      );

      await expect(loadConfig(configPath)).resolves.toMatchObject({
        auth: {
          user: { email: "user@example.com" }
        }
      });
      expect(await getFileMode(configPath)).toBe(0o600);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns an empty config when the file does not exist", async () => {
    await expect(loadConfig(join(tmpdir(), "neptune-missing-config.json"))).resolves.toEqual({});
  });

  it("migrates a legacy local config when the Neptune config is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-context-"));
    const configPath = join(dir, "home", ".neptune", "config.json");
    const oldConfigPath = join(dir, "home", ".agentctx", "config.json");

    try {
      await writeConfig(
        {
          apiUrl: "http://127.0.0.1:8787",
          auth: {
            accessToken: "access",
            refreshToken: "refresh",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1", email: "user@example.com" }
          }
        },
        oldConfigPath
      );

      await expect(loadConfig(configPath, oldConfigPath)).resolves.toMatchObject({
        auth: {
          user: { email: "user@example.com" }
        }
      });
      await expect(loadConfig(configPath)).resolves.toMatchObject({
        auth: {
          accessToken: "access"
        }
      });
      expect(await getFileMode(configPath)).toBe(0o600);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
