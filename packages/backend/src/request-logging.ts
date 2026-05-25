import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { isAppError } from "./app-error.js";
import type { AppVariables } from "./types.js";
import type { Logger } from "pino";
import { createMiddleware } from "hono/factory";

function logLevelForStatus(status: number): "info" | "warn" | "error" {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "info";
}

function routePath(url: string): string {
  return new URL(url).pathname;
}

export function createRequestLoggingMiddleware(rootLogger: Logger) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const startedAt = performance.now();
    const path = routePath(c.req.url);
    const requestId = c.req.header("x-request-id") ?? randomUUID();
    const requestLogger = rootLogger.child({ request_id: requestId });

    c.header("x-request-id", requestId);
    c.set("requestId", requestId);
    c.set("logger", requestLogger);

    try {
      await next();

      if (path === "/health") {
        return;
      }

      const status = c.res.status;
      const errorCode = c.var.errorCode;
      requestLogger[logLevelForStatus(status)](
        {
          event: "http_request",
          method: c.req.method,
          path,
          status,
          duration_ms: Math.round(performance.now() - startedAt),
          user_id: c.var.user?.id,
          ...(errorCode ? { error_code: errorCode } : {})
        },
        status >= 400 ? "http_request_failed" : "http_request"
      );
    } catch (error) {
      if (path !== "/health") {
        const appError = isAppError(error) ? error : null;
        const status = appError?.status ?? 500;
        requestLogger[logLevelForStatus(status)](
          {
            event: "http_request",
            method: c.req.method,
            path,
            status,
            duration_ms: Math.round(performance.now() - startedAt),
            error_code: appError?.code ?? "INTERNAL_ERROR",
            user_id: c.var.user?.id,
            err: appError
              ? undefined
              : {
                  name: error instanceof Error ? error.name : "UnknownError",
                  message: error instanceof Error ? error.message : "Unknown error"
                }
          },
          "http_request_failed"
        );
      }

      throw error;
    }
  });
}
