import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "../src/api.js";

describe("CLI API client", () => {
  it("sends the stored bearer token to the backend", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, orgs: [] }),
      json: async () => ({ ok: true, orgs: [] })
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
    ).rejects.toThrow(/neptune login/);
  });

  it("refreshes an expiring token before calling the backend", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, orgs: [] }),
      json: async () => ({ ok: true, orgs: [] })
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
});
