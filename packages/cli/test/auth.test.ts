import { describe, expect, it } from "vitest";
import { addApiKeyToOAuthUrl } from "../src/auth.js";

describe("OAuth URL handling", () => {
  it("adds the Supabase anon key as the browser apikey query param", () => {
    const url = addApiKeyToOAuthUrl(
      "https://example.supabase.co/auth/v1/authorize?provider=github",
      "anon-key"
    );

    expect(new URL(url).searchParams.get("apikey")).toBe("anon-key");
  });

  it("does not overwrite an existing apikey query param", () => {
    const url = addApiKeyToOAuthUrl(
      "https://example.supabase.co/auth/v1/authorize?provider=github&apikey=existing",
      "anon-key"
    );

    expect(new URL(url).searchParams.get("apikey")).toBe("existing");
  });
});
