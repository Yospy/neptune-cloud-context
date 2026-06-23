import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { AppError } from "./app-error.js";
import type { AppVariables } from "./types.js";

export type RateLimitRule = {
  name: string;
  limit: number;
  windowMs: number;
};

export type RateLimitStore = Map<string, { count: number; resetAt: number }>;
type RateLimitContext = Context<{ Variables: AppVariables }>;

export const defaultRateLimitRules = {
  preAuthProtectedRoute: {
    name: "pre-auth-protected-route",
    limit: 300,
    windowMs: 60_000
  },
  protectedRoute: {
    name: "protected-route",
    limit: 300,
    windowMs: 60_000
  },
  createContext: {
    name: "create-context",
    limit: 30,
    windowMs: 60_000
  },
  relevantContext: {
    name: "relevant-context",
    limit: 120,
    windowMs: 60_000
  },
  getContext: {
    name: "get-context",
    limit: 120,
    windowMs: 60_000
  }
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitOptions = {
  rule: RateLimitRule;
  store?: RateLimitStore;
  now?: () => number;
  key?: (c: RateLimitContext) => string | null;
};

function bucketKey(identity: string, ruleName: string) {
  return `${ruleName}:${identity}`;
}

function firstHeaderValue(value: string | undefined) {
  return value?.split(",")[0]?.trim() || null;
}

export function clientIpRateLimitKey(c: RateLimitContext) {
  return (
    firstHeaderValue(c.req.header("x-forwarded-for")) ??
    firstHeaderValue(c.req.header("x-real-ip")) ??
    firstHeaderValue(c.req.header("cf-connecting-ip")) ??
    "unknown"
  );
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  const store = options.store ?? new Map<string, { count: number; resetAt: number }>();
  const now = options.now ?? Date.now;
  const rule = options.rule;
  const key = options.key ?? ((c: RateLimitContext) => c.var.user?.id ?? null);

  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const identity = key(c);

    if (!identity) {
      await next();
      return;
    }

    const appliedRules = c.var.rateLimitRules ?? new Set<string>();
    if (appliedRules.has(rule.name)) {
      await next();
      return;
    }
    appliedRules.add(rule.name);
    c.set("rateLimitRules", appliedRules);

    const currentTime = now();
    const storeKey = bucketKey(identity, rule.name);
    const current = store.get(storeKey);
    const bucket =
      current && current.resetAt > currentTime
        ? current
        : { count: 0, resetAt: currentTime + rule.windowMs };

    bucket.count += 1;
    store.set(storeKey, bucket);

    if (bucket.count > rule.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000));
      c.header("retry-after", String(retryAfterSeconds));
      throw new AppError("RATE_LIMITED", "Rate limit exceeded.", {
        limit: rule.limit,
        window_ms: rule.windowMs,
        retry_after_seconds: retryAfterSeconds
      });
    }

    await next();
  });
}
