import { describe, expect, it } from "vitest";
import { addApiKeyToOAuthUrl, renderCallbackHtml } from "../src/auth.js";

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

describe("OAuth callback page", () => {
  it("renders the dark success handoff page", () => {
    const html = renderCallbackHtml(200, "Signed in", "Return to your terminal to continue.");

    expect(html).toContain("<title>Signed in</title>");
    expect(html).toContain("radial-gradient(ellipse 80% 60% at 50% 0%");
    expect(html).toContain("--bg: #000000");
    expect(html).toContain("--success: #22c55e");
    expect(html).toContain("<div class=\"brand\">Neptune</div>");
    expect(html).toContain('<path d="m6.9 12.6 3.4 3.3 7-7.4" />');
    expect(html).not.toContain("border-radius: 50%");
    expect(html).not.toContain("color-mix(in srgb, var(--tone)");
    expect(html).toContain("<p class=\"eyebrow\">Authentication complete</p>");
    expect(html).toContain("<h1>Signed in</h1>");
    expect(html).toContain("<p class=\"message\">Return to your terminal to continue.</p>");
  });

  it("escapes callback content before rendering", () => {
    const html = renderCallbackHtml(400, "Bad <title>", "<script>alert('x')</script>");

    expect(html).toContain("<title>Bad &lt;title&gt;</title>");
    expect(html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
  });
});
