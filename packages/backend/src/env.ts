import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().refine((value) => value.startsWith("https://"), {
    message: "NEXT_PUBLIC_SUPABASE_URL must use https."
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  PORT: z
    .preprocess((value) => {
      if (value === undefined || value === "") return 8787;
      if (typeof value === "string") return Number(value);
      return value;
    }, z.number().int().min(1).max(65535))
    .default(8787),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
    .default("info"),
  LOG_PRETTY: z
    .preprocess((value) => {
      if (value === undefined || value === "") return undefined;
      if (value === "true") return true;
      if (value === "false") return false;
      return value;
    }, z.boolean().optional()),
  HEALTH_LOG_INTERVAL_MS: z
    .preprocess((value) => {
      if (value === undefined || value === "") return 60000;
      if (typeof value === "string") return Number(value);
      return value;
    }, z.number().int().min(0).max(86400000))
    .default(60000)
});

export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const keys = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid backend environment: ${keys}`);
  }

  return {
    supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
    port: parsed.data.PORT,
    nodeEnv: parsed.data.NODE_ENV,
    logLevel: parsed.data.LOG_LEVEL,
    logPretty: parsed.data.LOG_PRETTY ?? (parsed.data.NODE_ENV === "development"),
    healthLogIntervalMs: parsed.data.HEALTH_LOG_INTERVAL_MS
  };
}
