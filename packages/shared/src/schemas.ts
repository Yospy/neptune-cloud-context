import { z } from "zod";
import {
  contextStatusValues,
  contextTypeValues,
  priorityValues,
  workstreamValues
} from "./enums.js";

const nonEmptyText = z.string().trim().min(1);
const stringList = z.array(z.string().trim().min(1)).default([]);
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

export const createContextRequestSchema = z.object({
  project_id: z.string().uuid(),
  title: nonEmptyText.max(160),
  summary: nonEmptyText.max(500),
  content_md: nonEmptyText,
  source_workstream: workstreamSchema,
  target_workstreams: z.array(workstreamSchema).min(1),
  domain: nonEmptyText.max(80),
  code_areas: stringList,
  context_type: contextTypeSchema,
  priority: prioritySchema.default("normal"),
  tags: stringList,
  repo_paths: stringList,
  related_files: stringList,
  confidence_score: z.number().min(0).max(1).optional(),
  inference_notes: z.string().trim().optional()
});

export const relevantContextQuerySchema = z.object({
  project_id: z.string().uuid(),
  target_workstream: workstreamSchema,
  domain: z.string().trim().min(1).optional(),
  code_area: z.string().trim().min(1).optional(),
  context_type: contextTypeSchema.optional(),
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

export type CreateOrgRequest = z.infer<typeof createOrgRequestSchema>;
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type OrgIdParams = z.infer<typeof orgIdParamsSchema>;
export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;
export type CreateContextRequest = z.infer<typeof createContextRequestSchema>;
export type RelevantContextQuery = z.infer<typeof relevantContextQuerySchema>;
export type MarkContextReadRequest = z.infer<typeof markContextReadRequestSchema>;
export type MarkContextReferencedRequest = z.infer<typeof markContextReferencedRequestSchema>;
export type ResolveContextRequest = z.infer<typeof resolveContextRequestSchema>;
