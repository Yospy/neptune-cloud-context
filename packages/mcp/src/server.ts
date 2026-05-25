import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toolDefinitions, callNeptuneTool, type NeptuneToolDeps } from "./tools.js";

export function createNeptuneMcpServer(deps: NeptuneToolDeps = {}) {
  const server = new McpServer(
    {
      name: "neptune-context-mcp",
      version: "0.1.0"
    },
    {
      instructions:
        "Use Neptune tools to coordinate project-scoped markdown context. Prefer repo project bindings, list and read relevant context before implementation, and mark context referenced after using it."
    }
  );

  for (const tool of toolDefinitions) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations
      },
      async (args) => callNeptuneTool(tool.name, args as Record<string, unknown>, deps)
    );
  }

  return server;
}
