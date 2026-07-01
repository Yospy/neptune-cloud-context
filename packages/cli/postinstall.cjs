#!/usr/bin/env node

const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

function isGlobalInstall() {
  return (
    process.env.npm_config_global === "true" ||
    process.env.npm_config_global === "1" ||
    process.env.npm_config_location === "global"
  );
}

if (!isGlobalInstall() || process.env.CI || process.env.NEPTUNE_SKIP_POSTINSTALL_SETUP === "1") {
  process.exit(0);
}

const cliPath = join(__dirname, "dist", "index.js");
if (!existsSync(cliPath)) {
  process.exit(0);
}

const cwd = process.env.INIT_CWD || process.cwd();
const result = spawnSync(process.execPath, [cliPath, "setup"], {
  cwd,
  env: { ...process.env, NEPTUNE_SETUP_CWD: cwd },
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
