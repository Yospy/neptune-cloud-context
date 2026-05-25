#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createNeptuneMcpServer } from "./server.js";

function assertSupportedNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major < 20) {
    throw new Error(`neptune-context-mcp requires Node.js >=20. Current Node.js: ${process.versions.node}`);
  }
}

async function main() {
  assertSupportedNodeVersion();
  const server = createNeptuneMcpServer();
  const transport = new StdioServerTransport();

  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });

  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
