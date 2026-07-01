function assertSupportedNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major < 20) {
    throw new Error(`neptune mcp serve requires Node.js >=20. Current Node.js: ${process.versions.node}`);
  }
}

export async function runMcpServe(): Promise<number> {
  assertSupportedNodeVersion();
  await import("neptune-context-mcp/dist/index.js");
  return 0;
}
