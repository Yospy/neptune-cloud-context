import { describe, expect, it } from "vitest";
import { requireSupabasePublicConfig, resolveCliEnv } from "../src/env.js";

describe("CLI env resolution", () => {
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
