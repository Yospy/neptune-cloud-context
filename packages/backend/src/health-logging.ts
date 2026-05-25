import type { BackendEnv } from "./types.js";
import type { Logger } from "pino";

export function startHealthLogging(logger: Logger, env: BackendEnv): NodeJS.Timeout | null {
  if (env.healthLogIntervalMs === 0) {
    return null;
  }

  const writeHealthLog = () => {
    const memory = process.memoryUsage();
    logger.info(
      {
        event: "backend_health",
        uptime_s: Math.round(process.uptime()),
        memory_rss_mb: Math.round(memory.rss / 1024 / 1024),
        memory_heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024)
      },
      "backend_health"
    );
  };

  const timer = setInterval(writeHealthLog, env.healthLogIntervalMs);
  timer.unref();

  return timer;
}
