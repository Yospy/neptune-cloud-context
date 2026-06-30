import { z } from "zod";
import {
  authorNoteSourceValues,
  contextStatusValues,
  contextTypeValues,
  priorityValues,
  workstreamValues
} from "./enums.js";

const nonEmptyText = z.string().trim().min(1);
const slug = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const workstreamSchema = z.enum(workstreamValues);
export const contextTypeSchema = z.enum(contextTypeValues);
export const contextStatusSchema = z.enum(contextStatusValues);
export const prioritySchema = z.enum(priorityValues);
export const retrievalModeSchema = z.enum(["smart", "strict"]);
export const authorNoteSourceSchema = z.enum(authorNoteSourceValues);

export const contextPayloadLimits = {
  titleMax: 160,
  summaryMax: 500,
  contentMdMax: 100_000,
  authorNoteMax: 1_000,
  domainMax: 80,
  targetWorkstreamsMax: workstreamValues.length,
  codeAreasMax: 25,
  codeAreaMax: 120,
  tagsMax: 25,
  tagMax: 80,
  repoPathsMax: 50,
  repoPathMax: 500,
  relatedFilesMax: 50,
  relatedFileMax: 500,
  retrievalQueryMax: 500,
  inferenceNotesMax: 1_000
} as const;

function stringList(maxItems: number, maxItemLength: number) {
  return z.array(z.string().trim().min(1).max(maxItemLength)).max(maxItems).default([]);
}

const authorNoteText = nonEmptyText.max(contextPayloadLimits.authorNoteMax);

function requireAuthorNotePair(
  value: { author_note_md?: string; author_note_source?: string },
  ctx: z.RefinementCtx
) {
  if (value.author_note_md && !value.author_note_source) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["author_note_source"],
      message: "author_note_source is required when author_note_md is provided"
    });
  }

  if (!value.author_note_md && value.author_note_source) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["author_note_md"],
      message: "author_note_md is required when author_note_source is provided"
    });
  }
}

export const createOrgRequestSchema = z.object({
  slug,
  name: nonEmptyText.max(120)
});

export const createProjectRequestSchema = z.object({
  org_id: z.string().uuid(),
  slug,
  name: nonEmptyText.max(120),
  default_workstream: workstreamSchema.default("general")
});

export const listProjectsQuerySchema = z.object({
  org_id: z.string().uuid().optional()
});

export const orgIdParamsSchema = z.object({
  org_id: z.string().uuid()
});

export const projectIdParamsSchema = z.object({
  project_id: z.string().uuid()
});

export const createContextRequestSchema = z
  .object({
    project_id: z.string().uuid(),
    title: nonEmptyText.max(contextPayloadLimits.titleMax),
    summary: nonEmptyText.max(contextPayloadLimits.summaryMax),
    content_md: nonEmptyText.max(contextPayloadLimits.contentMdMax),
    author_note_md: authorNoteText.optional(),
    author_note_source: authorNoteSourceSchema.optional(),
    source_workstream: workstreamSchema,
    target_workstreams: z
      .array(workstreamSchema)
      .min(1)
      .max(contextPayloadLimits.targetWorkstreamsMax),
    domain: nonEmptyText.max(contextPayloadLimits.domainMax),
    code_areas: stringList(contextPayloadLimits.codeAreasMax, contextPayloadLimits.codeAreaMax),
    context_type: contextTypeSchema,
    priority: prioritySchema.default("normal"),
    tags: stringList(contextPayloadLimits.tagsMax, contextPayloadLimits.tagMax),
    repo_paths: stringList(contextPayloadLimits.repoPathsMax, contextPayloadLimits.repoPathMax),
    related_files: stringList(
      contextPayloadLimits.relatedFilesMax,
      contextPayloadLimits.relatedFileMax
    ),
    confidence_score: z.number().min(0).max(1).optional(),
    inference_notes: z.string().trim().max(contextPayloadLimits.inferenceNotesMax).optional()
  })
  .superRefine(requireAuthorNotePair);

export const relevantContextQuerySchema = z.object({
  project_id: z.string().uuid(),
  target_workstream: workstreamSchema,
  query: z.string().trim().min(1).max(contextPayloadLimits.retrievalQueryMax).optional(),
  domain: z.string().trim().min(1).optional(),
  code_area: z.string().trim().min(1).optional(),
  context_type: contextTypeSchema.optional(),
  updated_after: z.string().datetime({ offset: true }).optional(),
  unread_only: z
    .preprocess((value) => {
      if (value === "true") return true;
      if (value === "false") return false;
      return value;
    }, z.boolean())
    .default(false),
  limit: z
    .preprocess((value) => {
      if (typeof value === "string" && value.trim()) return Number(value);
      return value;
    }, z.number().int().min(1).max(50))
    .default(10)
});

export const retrieveContextQuerySchema = z.object({
  project_id: z.string().uuid(),
  intent: z.string().trim().min(1).max(contextPayloadLimits.retrievalQueryMax).optional(),
  mode: retrievalModeSchema.default("smart"),
  target_workstream: workstreamSchema.optional(),
  domain: z.string().trim().min(1).optional(),
  code_area: z.string().trim().min(1).optional(),
  context_type: contextTypeSchema.optional(),
  limit: z
    .preprocess((value) => {
      if (typeof value === "string" && value.trim()) return Number(value);
      return value;
    }, z.number().int().min(1).max(50))
    .default(10)
});

export const contextIdParamsSchema = z.object({
  context_id: z.string().uuid()
});

export const markContextReadRequestSchema = z.object({
  agent_name: z.string().trim().min(1).max(80).default("neptune")
});

export const markContextReferencedRequestSchema = z.object({
  agent_name: z.string().trim().min(1).max(80).default("neptune"),
  note: z.string().trim().max(500).optional(),
  repo_path: z.string().trim().min(1).max(500).optional(),
  git_commit: z.string().trim().min(7).max(64).optional()
});

export const resolveContextRequestSchema = z.object({
  agent_name: z.string().trim().min(1).max(80).default("neptune"),
  note: z.string().trim().max(500).optional()
});

export const updateContextAuthorNoteRequestSchema = z.object({
  author_note_md: authorNoteText,
  author_note_source: authorNoteSourceSchema
});

export type CreateOrgRequest = z.infer<typeof createOrgRequestSchema>;
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type OrgIdParams = z.infer<typeof orgIdParamsSchema>;
export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;
export type CreateContextRequest = z.infer<typeof createContextRequestSchema>;
export type RelevantContextQuery = z.infer<typeof relevantContextQuerySchema>;
export type RetrieveContextQuery = z.infer<typeof retrieveContextQuerySchema>;
export type MarkContextReadRequest = z.infer<typeof markContextReadRequestSchema>;
export type MarkContextReferencedRequest = z.infer<typeof markContextReferencedRequestSchema>;
export type ResolveContextRequest = z.infer<typeof resolveContextRequestSchema>;
export type UpdateContextAuthorNoteRequest = z.infer<typeof updateContextAuthorNoteRequestSchema>;
