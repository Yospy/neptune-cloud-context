import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/env.js";

describe("loadEnv", () => {
  it("loads required Supabase placeholders without exposing secrets", () => {
    const env = loadEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-placeholder",
      SUPABASE_SERVICE_ROLE_KEY: "service-placeholder",
      NODE_ENV: "test",
      LOG_LEVEL: "debug",
      LOG_PRETTY: "false",
      HEALTH_LOG_INTERVAL_MS: "30000"
    });

    expect(env.port).toBe(8787);
    expect(env.logLevel).toBe("debug");
    expect(env.logPretty).toBe(false);
    expect(env.healthLogIntervalMs).toBe(30000);
    expect(env.supabaseServiceRoleKey).toBe("service-placeholder");
  });

  it("fails fast when required keys are missing", () => {
    expect(() => loadEnv({ NODE_ENV: "test" })).toThrow(
      "Invalid backend environment"
    );
  });
});
