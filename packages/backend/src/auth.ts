import { createMiddleware } from "hono/factory";
import { AppError } from "./app-error.js";
import type { AppVariables, AuthClientLike } from "./types.js";

function stringMetadata(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function providerMetadata(appMetadata: Record<string, unknown> | undefined): string | null {
  const provider = stringMetadata(appMetadata?.provider);
  if (provider) return provider;

  const providers = appMetadata?.providers;
  if (Array.isArray(providers)) {
    return stringMetadata(...providers);
  }

  return null;
}

export function createAuthMiddleware(authClient: AuthClientLike) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const match = header.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      throw new AppError("AUTH_REQUIRED", "Bearer token is required.");
    }

    const { data, error } = await authClient.auth.getUser(match[1]);

    if (error || !data.user?.id) {
      throw new AppError("AUTH_REQUIRED", "Bearer token is invalid.");
    }

    const userMetadata = data.user.user_metadata;
    const appMetadata = data.user.app_metadata;

    c.set("user", {
      id: data.user.id,
      email: data.user.email ?? null,
      display_name: stringMetadata(
        userMetadata?.full_name,
        userMetadata?.name,
        userMetadata?.user_name,
        userMetadata?.preferred_username
      ),
      avatar_url: stringMetadata(userMetadata?.avatar_url, userMetadata?.picture),
      provider: providerMetadata(appMetadata)
    });

    await next();
  });
}
