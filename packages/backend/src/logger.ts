import pino, { type Logger } from "pino";
import type { BackendEnv } from "./types.js";

export function createLogger(env: BackendEnv): Logger {
  return pino({
    name: "neptune-backend",
    level: env.logLevel,
    base: {
      service: "neptune-backend",
      env: env.nodeEnv
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        "authorization",
        "req.headers.authorization",
        "headers.authorization",
        "token",
        "jwt",
        "accessToken",
        "supabaseAnonKey",
        "supabaseServiceRoleKey",
        "SUPABASE_SERVICE_ROLE_KEY"
      ],
      censor: "[REDACTED]"
    },
    transport: env.logPretty
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            singleLine: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname"
          }
        }
      : undefined
  });
}

export function createSilentLogger(): Logger {
  return pino({ enabled: false });
}
