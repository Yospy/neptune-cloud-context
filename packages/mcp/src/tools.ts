import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { NeptuneClient } from "neptune-context";
import {
  createNeptuneClient,
  formatUploadReceipt,
  requireProjectBinding as sdkRequireProjectBinding
} from "neptune-context";
import {
  authorNoteSourceValues,
  contextPayloadLimits,
  contextTypeValues,
  priorityValues,
  workstreamValues
} from "neptune-context-shared";
import * as z from "zod";

export const NEPTUNE_TOOL_NAMES = [
  "require_project_binding",
  "retrieve_context",
  "list_relevant_context",
  "get_context",
  "create_context",
  "update_context_author_note",
  "mark_context_referenced"
] as const;

export type NeptuneToolName = (typeof NEPTUNE_TOOL_NAMES)[number];

export type NeptuneToolDeps = {
  client?: NeptuneClient;
  cwd?: string;
  requireProjectBinding?: typeof sdkRequireProjectBinding;
};

type ToolContext = Required<NeptuneToolDeps>;

type ToolDefinition = {
  name: NeptuneToolName;
  title: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  annotations?: ToolAnnotations;
  handler: (args: Record<string, unknown>, context: ToolContext) => Promise<unknown> | unknown;
};

const workstreamSchema = z.enum(workstreamValues);
const contextTypeSchema = z.enum(contextTypeValues);
const prioritySchema = z.enum(priorityValues);
const authorNoteSourceSchema = z.enum(authorNoteSourceValues);
const uuidSchema = z.string().uuid();
const cwdSchema = z.string().trim().min(1).optional();

function stringListSchema(maxItems: number, maxItemLength: number) {
  return z.array(z.string().trim().min(1).max(maxItemLength)).max(maxItems).default([]);
}

function resolveContext(deps: NeptuneToolDeps = {}): ToolContext {
  return {
    client: deps.client ?? createNeptuneClient(),
    cwd: deps.cwd ?? process.cwd(),
    requireProjectBinding: deps.requireProjectBinding ?? sdkRequireProjectBinding
  };
}

function successResult(data: unknown, text?: string): CallToolResult {
  const structuredContent = data && typeof data === "object" ? (data as Record<string, unknown>) : { value: data };
  return {
    content: [
      {
        type: "text",
        text: text ?? JSON.stringify(structuredContent, null, 2)
      }
    ],
    structuredContent
  };
}

function errorResult(error: unknown): CallToolResult {
  const candidate = error as {
    name?: string;
    code?: string;
    status?: number;
    message?: string;
    details?: unknown;
  };
  const errorPayload = {
    ok: false,
    error: {
      name: candidate?.name ?? "Error",
      code: candidate?.code ?? "UNKNOWN_ERROR",
      status: candidate?.status,
      message: candidate?.message ?? "Unknown error.",
      details: candidate?.details
    }
  };

  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `${errorPayload.error.code}: ${errorPayload.error.message}`
      }
    ],
    structuredContent: errorPayload
  };
}

const createContextSchema = z.object({
  project_id: uuidSchema,
  title: z.string().trim().min(1).max(contextPayloadLimits.titleMax),
  summary: z.string().trim().min(1).max(contextPayloadLimits.summaryMax),
  content_md: z.string().trim().min(1).max(contextPayloadLimits.contentMdMax),
  author_note_md: z.string().trim().min(1).max(contextPayloadLimits.authorNoteMax).optional(),
  author_note_source: authorNoteSourceSchema.optional(),
  source_workstream: workstreamSchema,
  target_workstreams: z
    .array(workstreamSchema)
    .min(1)
    .max(contextPayloadLimits.targetWorkstreamsMax),
  domain: z.string().trim().min(1).max(contextPayloadLimits.domainMax),
  code_areas: stringListSchema(
    contextPayloadLimits.codeAreasMax,
    contextPayloadLimits.codeAreaMax
  ),
  context_type: contextTypeSchema,
  priority: prioritySchema.default("normal"),
  tags: stringListSchema(contextPayloadLimits.tagsMax, contextPayloadLimits.tagMax),
  repo_paths: stringListSchema(
    contextPayloadLimits.repoPathsMax,
    contextPayloadLimits.repoPathMax
  ),
  related_files: stringListSchema(
    contextPayloadLimits.relatedFilesMax,
    contextPayloadLimits.relatedFileMax
  ),
  confidence_score: z.number().min(0).max(1).optional(),
  inference_notes: z.string().trim().max(contextPayloadLimits.inferenceNotesMax).optional()
});

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "require_project_binding",
    title: "Require Repo Project Binding",
    description: "Read the current repo binding or return PROJECT_NOT_BOUND.",
    inputSchema: z.object({ cwd: cwdSchema }),
    annotations: { readOnlyHint: true },
    handler: async (args, context) => ({
      ok: true,
      binding: await context.requireProjectBinding((args.cwd as string | undefined) ?? context.cwd)
    })
  },
  {
    name: "retrieve_context",
    title: "Retrieve Context",
    description:
      "Smart project-wide context retrieval for natural user intent. Use this before implementation and for vague requests like latest context, uploaded today, rough keywords, or typo-prone document references.",
    inputSchema: z.object({
      project_id: uuidSchema,
      intent: z.string().trim().min(1).max(contextPayloadLimits.retrievalQueryMax).optional(),
      mode: z.enum(["smart", "strict"]).default("smart"),
      target_workstream: workstreamSchema.optional(),
      domain: z.string().trim().min(1).optional(),
      code_area: z.string().trim().min(1).optional(),
      context_type: contextTypeSchema.optional(),
      limit: z.number().int().min(1).max(50).default(10)
    }),
    annotations: { readOnlyHint: true },
    handler: (args, context) => context.client.retrieveContext(args as Parameters<NeptuneClient["retrieveContext"]>[0])
  },
  {
    name: "list_relevant_context",
    title: "List Relevant Context",
    description:
      "List active context relevant to a project/workstream. Pass the user's task or a distilled retrieval intent as query; use optional routing filters only when confident.",
    inputSchema: z.object({
      project_id: uuidSchema,
      target_workstream: workstreamSchema,
      query: z.string().trim().min(1).max(contextPayloadLimits.retrievalQueryMax).optional(),
      domain: z.string().trim().min(1).optional(),
      code_area: z.string().trim().min(1).optional(),
      context_type: contextTypeSchema.optional(),
      updated_after: z.string().datetime({ offset: true }).optional(),
      unread_only: z.boolean().default(false),
      limit: z.number().int().min(1).max(50).default(10)
    }),
    annotations: { readOnlyHint: true },
    handler: (args, context) => context.client.listRelevantContext(args as Parameters<NeptuneClient["listRelevantContext"]>[0])
  },
  {
    name: "get_context",
    title: "Get Context",
    description: "Fetch one context record by context ID.",
    inputSchema: z.object({ context_id: uuidSchema }),
    annotations: { readOnlyHint: true },
    handler: (args, context) => context.client.getContext(args.context_id as string)
  },
  {
    name: "create_context",
    title: "Create Context",
    description:
      "Upload markdown context with explicit Neptune routing metadata. Include author_note_md with author_note_source=manual when the author supplied a note; if no note was supplied and the markdown has clear intent, provide a concise inferred author note with author_note_source=agent_inferred.",
    inputSchema: createContextSchema,
    handler: async (args, context) => {
      const response = await context.client.createContext(args as Parameters<NeptuneClient["createContext"]>[0]);
      return {
        text: formatUploadReceipt(response),
        response
      };
    }
  },
  {
    name: "update_context_author_note",
    title: "Update Context Author Note",
    description:
      "Update the author-owned note for a context. Only the original context author is allowed to update this note.",
    inputSchema: z.object({
      context_id: uuidSchema,
      author_note_md: z.string().trim().min(1).max(contextPayloadLimits.authorNoteMax),
      author_note_source: authorNoteSourceSchema
    }),
    handler: (args, context) => {
      const { context_id, ...input } = args;
      return context.client.updateContextAuthorNote(
        context_id as string,
        input as Parameters<NeptuneClient["updateContextAuthorNote"]>[1]
      );
    }
  },
  {
    name: "mark_context_referenced",
    title: "Mark Context Referenced",
    description: "Record that the agent used a context record while working.",
    inputSchema: z.object({
      context_id: uuidSchema,
      agent_name: z.string().trim().min(1).max(80).default("neptune"),
      note: z.string().trim().max(500).optional(),
      repo_path: z.string().trim().min(1).max(500).optional(),
      git_commit: z.string().trim().min(7).max(64).optional()
    }),
    handler: (args, context) => {
      const { context_id, ...input } = args;
      return context.client.markContextReferenced(context_id as string, input);
    }
  }
];

export function getToolDefinition(name: string) {
  return toolDefinitions.find((tool) => tool.name === name);
}

export async function callNeptuneTool(
  name: NeptuneToolName,
  args: Record<string, unknown> = {},
  deps: NeptuneToolDeps = {}
): Promise<CallToolResult> {
  const definition = getToolDefinition(name);
  if (!definition) {
    return errorResult({ code: "TOOL_NOT_FOUND", message: `Unknown Neptune tool: ${name}` });
  }

  const parsed = definition.inputSchema.safeParse(args);
  if (!parsed.success) {
    return errorResult({
      code: "VALIDATION_FAILED",
      message: "Tool input validation failed.",
      details: z.treeifyError(parsed.error)
    });
  }

  try {
    const data = await definition.handler(parsed.data, resolveContext(deps));
    if (
      data &&
      typeof data === "object" &&
      "text" in data &&
      "response" in data &&
      typeof (data as { text?: unknown }).text === "string"
    ) {
      return successResult((data as { response: unknown }).response, (data as { text: string }).text);
    }
    return successResult(data);
  } catch (error) {
    return errorResult(error);
  }
}
