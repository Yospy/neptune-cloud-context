import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv(path) {
  const env = {};
  const content = readFileSync(path, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[match[1]] = value;
  }

  return env;
}

function required(env, key) {
  const value = env[key] || process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

function normalizeSupabaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use https.");
  }
  return url.origin;
}

async function main() {
  const envPath = resolve(process.cwd(), ".env");
  const env = loadDotEnv(envPath);

  const supabaseUrl = normalizeSupabaseUrl(
    required(env, "NEXT_PUBLIC_SUPABASE_URL"),
  );
  const anonKey = required(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const response = await fetch(
    `${supabaseUrl}/rest/v1/__neptune_connection_check?select=*&limit=1`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    },
  );

  const body = await response.text();

  if (response.ok) {
    console.log("Supabase connection OK");
    console.log(`Project URL: ${supabaseUrl}`);
    console.log(
      "Validated: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
    return;
  }

  let payload = {};
  try {
    payload = JSON.parse(body);
  } catch {
    payload = {};
  }

  if (response.status === 404 && payload.code === "PGRST205") {
    console.log("Supabase connection OK");
    console.log(`Project URL: ${supabaseUrl}`);
    console.log(
      "Validated: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
    console.log(
      "Probe table absent, as expected: public.__neptune_connection_check",
    );
    return;
  }

  const rootResponse = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });

  throw new Error(
    `Supabase REST check failed: ${response.status} ${response.statusText}\n${body.slice(0, 500)}\nREST root status: ${rootResponse.status} ${rootResponse.statusText}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
