import {
  contextIdParamsSchema,
  createContextRequestSchema,
  createOrgRequestSchema,
  createProjectRequestSchema,
  listProjectsQuerySchema,
  markContextReferencedRequestSchema,
  markContextReadRequestSchema,
  orgIdParamsSchema,
  projectIdParamsSchema,
  relevantContextQuerySchema,
  resolveContextRequestSchema
} from "neptune-context-shared";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Logger } from "pino";
import { AppError, isAppError, toErrorResponse } from "./app-error.js";
import { createAuthMiddleware } from "./auth.js";
import { createSilentLogger } from "./logger.js";
import { createRequestLoggingMiddleware } from "./request-logging.js";
import type { AppVariables, AuthClientLike, ContextRepository } from "./types.js";

type AppDeps = {
  authClient: AuthClientLike;
  repository: ContextRepository;
  logger?: Logger;
};

function validationError(details: unknown) {
  return new AppError("VALIDATION_FAILED", "Request validation failed.", details);
}

async function readJson(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    throw validationError("Request body must be valid JSON.");
  }
}

async function readOptionalJson(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}

export function createApp(deps: AppDeps) {
  const app = new Hono<{ Variables: AppVariables }>();
  const requireAuth = createAuthMiddleware(deps.authClient);
  const syncUserProfile = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    await deps.repository.upsertUserProfile(c.var.user);
    await next();
  });
  const logger = deps.logger ?? createSilentLogger();

  app.use("*", createRequestLoggingMiddleware(logger));

  app.onError((error, c) => {
    const appError = isAppError(error)
      ? error
      : new AppError("INTERNAL_ERROR", "Internal server error.");

    c.set("errorCode", appError.code);

    return c.json(toErrorResponse(appError), appError.status as ContentfulStatusCode);
  });

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "neptune-backend"
    })
  );

  app.use("/contexts", requireAuth);
  app.use("/contexts", syncUserProfile);
  app.use("/contexts/*", requireAuth);
  app.use("/contexts/*", syncUserProfile);
  app.use("/me", requireAuth);
  app.use("/me", syncUserProfile);
  app.use("/orgs", requireAuth);
  app.use("/orgs", syncUserProfile);
  app.use("/orgs/*", requireAuth);
  app.use("/orgs/*", syncUserProfile);
  app.use("/projects", requireAuth);
  app.use("/projects", syncUserProfile);
  app.use("/projects/*", requireAuth);
  app.use("/projects/*", syncUserProfile);

  app.get("/me", async (c) => {
    return c.json(await deps.repository.getMe(c.var.user));
  });

  app.get("/orgs", async (c) => {
    return c.json(await deps.repository.listOrgs(c.var.user));
  });

  app.post("/orgs", async (c) => {
    const parsed = createOrgRequestSchema.safeParse(await readJson(c));

    if (!parsed.success) {
      throw validationError(parsed.error.flatten());
    }

    return c.json(await deps.repository.createOrg(parsed.data, c.var.user));
  });

  app.get("/orgs/:org_id/members", async (c) => {
    const parsed = orgIdParamsSchema.safeParse(c.req.param());

    if (!parsed.success) {
      throw validationError(parsed.error.flatten());
    }

    return c.json(await deps.repository.listOrgMembers(parsed.data.org_id, c.var.user));
  });

  app.get("/projects", async (c) => {
    const parsed = listProjectsQuerySchema.safeParse(c.req.query());

    if (!parsed.success) {
      throw validationError(parsed.error.flatten());
    }

    return c.json(await deps.repository.listProjects(parsed.data, c.var.user));
  });

  app.post("/projects", async (c) => {
    const parsed = createProjectRequestSchema.safeParse(await readJson(c));

    if (!parsed.success) {
      throw validationError(parsed.error.flatten());
    }

    return c.json(await deps.repository.createProject(parsed.data, c.var.user));
  });

  app.get("/projects/:project_id/members", async (c) => {
    const parsed = projectIdParamsSchema.safeParse(c.req.param());

    if (!parsed.success) {
      throw validationError(parsed.error.flatten());
    }

    return c.json(await deps.repository.listProjectMembers(parsed.data.project_id, c.var.user));
  });

  app.post("/contexts", async (c) => {
    const parsed = createContextRequestSchema.safeParse(await readJson(c));

    if (!parsed.success) {
      throw validationError(parsed.error.flatten());
    }

    const result = await deps.repository.createContext(parsed.data, c.var.user);
    return c.json(result);
  });

  app.get("/contexts/relevant", async (c) => {
    const parsed = relevantContextQuerySchema.safeParse(c.req.query());

    if (!parsed.success) {
      throw validationError(parsed.error.flatten());
    }

    const contexts = await deps.repository.listRelevantContext(parsed.data, c.var.user);
    return c.json({ ok: true, contexts });
  });

  app.get("/contexts/:context_id", async (c) => {
    const parsed = contextIdParamsSchema.safeParse(c.req.param());

    if (!parsed.success) {
      throw validationError(parsed.error.flatten());
    }

    const context = await deps.repository.getContext(parsed.data.context_id, c.var.user);
    return c.json({ ok: true, context });
  });

  app.post("/contexts/:context_id/read", async (c) => {
    const params = contextIdParamsSchema.safeParse(c.req.param());

    if (!params.success) {
      throw validationError(params.error.flatten());
    }

    const body = markContextReadRequestSchema.safeParse(await readOptionalJson(c));

    if (!body.success) {
      throw validationError(body.error.flatten());
    }

    await deps.repository.markContextRead(
      params.data.context_id,
      c.var.user,
      body.data.agent_name
    );

    return c.json({ ok: true });
  });

  app.post("/contexts/:context_id/reference", async (c) => {
    const params = contextIdParamsSchema.safeParse(c.req.param());

    if (!params.success) {
      throw validationError(params.error.flatten());
    }

    const body = markContextReferencedRequestSchema.safeParse(await readOptionalJson(c));

    if (!body.success) {
      throw validationError(body.error.flatten());
    }

    await deps.repository.markContextReferenced(params.data.context_id, c.var.user, body.data);

    return c.json({ ok: true });
  });

  app.post("/contexts/:context_id/resolve", async (c) => {
    const params = contextIdParamsSchema.safeParse(c.req.param());

    if (!params.success) {
      throw validationError(params.error.flatten());
    }

    const body = resolveContextRequestSchema.safeParse(await readOptionalJson(c));

    if (!body.success) {
      throw validationError(body.error.flatten());
    }

    await deps.repository.resolveContext(params.data.context_id, c.var.user, body.data);

    return c.json({ ok: true });
  });

  return app;
}
