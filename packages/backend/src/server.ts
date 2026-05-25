import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadBackendDotEnv } from "./dotenv.js";
import { loadEnv } from "./env.js";
import { startHealthLogging } from "./health-logging.js";
import { createLogger } from "./logger.js";
import { SupabaseContextRepository } from "./repository.js";
import { createSupabaseAdminClient, createSupabaseAuthClient } from "./supabase.js";

loadBackendDotEnv();

const env = loadEnv();
const logger = createLogger(env);
const authClient = createSupabaseAuthClient(env);
const adminClient = createSupabaseAdminClient(env);
const repository = new SupabaseContextRepository(adminClient);
const app = createApp({ authClient, repository, logger });

startHealthLogging(logger, env);

serve(
  {
    fetch: app.fetch,
    port: env.port
  },
  (info) => {
    logger.info(
      {
        event: "backend_started",
        port: info.port,
        health_log_interval_ms: env.healthLogIntervalMs,
        log_level: env.logLevel,
        log_pretty: env.logPretty
      },
      "backend_started"
    );
  }
);
