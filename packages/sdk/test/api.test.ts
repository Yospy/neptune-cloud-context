import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "../src/api.js";
import { NeptuneSdkError } from "../src/errors.js";

describe("SDK API client", () => {
  it("sends the stored bearer token to the backend", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, orgs: [] })
    }));

    await apiRequest(
      "/orgs",
      {},
      {
        fetch,
        config: {
          apiUrl: "http://127.0.0.1:8787",
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        }
      }
    );

    const [, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect((init?.headers as Headers).get("authorization")).toBe("Bearer access-token");
  });

  it("fails before network access when no token is stored", async () => {
    await expect(
      apiRequest("/orgs", {}, { config: { apiUrl: "http://127.0.0.1:8787" } })
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("refreshes an expiring token before calling the backend", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, orgs: [] })
    }));
    const refreshAuth = vi.fn(async () => ({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      tokenType: "bearer",
      user: { id: "user-1" }
    }));

    await apiRequest(
      "/orgs",
      {},
      {
        fetch,
        refreshAuth,
        config: {
          apiUrl: "http://127.0.0.1:8787",
          supabaseUrl: "https://supabase.example.com",
          supabaseAnonKey: "anon",
          auth: {
            accessToken: "old-access-token",
            refreshToken: "old-refresh-token",
            expiresAt: 1,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        }
      }
    );

    const [, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(refreshAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseUrl: "https://supabase.example.com",
        supabaseAnonKey: "anon"
      })
    );
    expect((init?.headers as Headers).get("authorization")).toBe("Bearer new-access-token");
  });

  it("normalizes backend error responses", async () => {
    const fetch = vi.fn(async () => ({
      ok: false,
      status: 403,
      text: async () =>
        JSON.stringify({
          ok: false,
          error: {
            code: "PROJECT_ACCESS_DENIED",
            message: "Project access denied."
          }
        })
    }));

    await expect(
      apiRequest("/projects", {}, {
        fetch,
        config: {
          apiUrl: "http://127.0.0.1:8787",
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        }
      })
    ).rejects.toEqual(
      expect.objectContaining({
        code: "PROJECT_ACCESS_DENIED",
        message: "Project access denied.",
        status: 403
      })
    );
  });

  it("preserves backend conflict errors", async () => {
    const fetch = vi.fn(async () => ({
      ok: false,
      status: 409,
      text: async () =>
        JSON.stringify({
          ok: false,
          error: {
            code: "CONFLICT",
            message: "Resource already exists."
          }
        })
    }));

    await expect(
      apiRequest("/orgs", {}, {
        fetch,
        config: {
          apiUrl: "http://127.0.0.1:8787",
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        }
      })
    ).rejects.toEqual(
      expect.objectContaining({
        code: "CONFLICT",
        message: "Resource already exists.",
        status: 409
      })
    );
  });

  it("preserves backend rate limit errors", async () => {
    const fetch = vi.fn(async () => ({
      ok: false,
      status: 429,
      text: async () =>
        JSON.stringify({
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: "Rate limit exceeded."
          }
        })
    }));

    await expect(
      apiRequest("/contexts", {}, {
        fetch,
        config: {
          apiUrl: "http://127.0.0.1:8787",
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        }
      })
    ).rejects.toEqual(
      expect.objectContaining({
        code: "RATE_LIMITED",
        message: "Rate limit exceeded.",
        status: 429
      })
    );
  });

  it("normalizes network failures", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("connection refused");
    });

    await expect(
      apiRequest("/health", {}, {
        fetch,
        config: {
          apiUrl: "http://127.0.0.1:8787",
          auth: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: 1800000000,
            tokenType: "bearer",
            user: { id: "user-1" }
          }
        }
      })
    ).rejects.toBeInstanceOf(NeptuneSdkError);
  });
});
