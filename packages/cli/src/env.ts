import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotEnvFile } from "dotenv";

export {
  DEFAULT_API_URL,
  requireSupabasePublicConfig,
  resolveNeptuneEnv,
  resolveNeptuneEnv as resolveCliEnv,
  type NeptuneEnv,
  type NeptuneEnv as CliEnv
} from "neptune-context";

export function loadCliDotEnv(cwd = process.cwd()) {
  const candidates = [resolve(cwd, ".env"), resolve(cwd, "../../.env")];

  for (const path of candidates) {
    if (existsSync(path)) {
      loadDotEnvFile({ path, override: false, quiet: true });
    }
  }
}
