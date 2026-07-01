import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCliDotEnv, requireSupabasePublicConfig, resolveCliEnv } from "../src/env.js";

describe("CLI env resolution", () => {
  afterEach(() => {
    delete process.env.NEPTUNE_DOTENV_TEST_VALUE;
    vi.restoreAllMocks();
  });

  it("loads project dotenv files without printing dotenv's injection banner", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neptune-cli-env-"));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await writeFile(join(dir, ".env"), "NEPTUNE_DOTENV_TEST_VALUE=loaded\n");

      loadCliDotEnv(dir);

      expect(process.env.NEPTUNE_DOTENV_TEST_VALUE).toBe("loaded");
      expect(log).not.toHaveBeenCalled();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prefers Neptune-specific env vars over stored config", () => {
    expect(
      resolveCliEnv(
        {
          NEPTUNE_API_URL: "https://api.example.com",
          NEPTUNE_SUPABASE_URL: "https://supabase.example.com",
          NEPTUNE_SUPABASE_ANON_KEY: "anon"
        },
        {
          apiUrl: "http://127.0.0.1:8787",
          supabaseUrl: "https://stored.example.com",
          supabaseAnonKey: "stored"
        }
      )
    ).toEqual({
      apiUrl: "https://api.example.com",
      supabaseUrl: "https://supabase.example.com",
      supabaseAnonKey: "anon"
    });
  });

  it("falls back to legacy AgentCtx env vars during rename cutover", () => {
    expect(
      resolveCliEnv(
        {
          AGENTCTX_API_URL: "https://old-api.example.com",
          AGENTCTX_SUPABASE_URL: "https://old-supabase.example.com",
          AGENTCTX_SUPABASE_ANON_KEY: "old-anon"
        },
        {
          apiUrl: "http://127.0.0.1:8787"
        }
      )
    ).toEqual({
      apiUrl: "https://old-api.example.com",
      supabaseUrl: "https://old-supabase.example.com",
      supabaseAnonKey: "old-anon"
    });
  });

  it("prefers Neptune env vars over legacy AgentCtx env vars", () => {
    expect(
      resolveCliEnv({
        NEPTUNE_API_URL: "https://api.example.com",
        NEPTUNE_SUPABASE_URL: "https://supabase.example.com",
        NEPTUNE_SUPABASE_ANON_KEY: "anon",
        AGENTCTX_API_URL: "https://old-api.example.com",
        AGENTCTX_SUPABASE_URL: "https://old-supabase.example.com",
        AGENTCTX_SUPABASE_ANON_KEY: "old-anon"
      })
    ).toEqual({
      apiUrl: "https://api.example.com",
      supabaseUrl: "https://supabase.example.com",
      supabaseAnonKey: "anon"
    });
  });

  it("throws when login is attempted without Supabase public config", () => {
    expect(() => requireSupabasePublicConfig({ apiUrl: "http://127.0.0.1:8787" })).toThrow(
      /Missing Supabase public config/
    );
  });
});
