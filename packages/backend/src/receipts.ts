import type { UploadReceipt } from "neptune-context-shared";
import type { ContextRow, OrgProject } from "./repository.js";

type ReceiptAttribution = Pick<UploadReceipt, "created_by_user" | "updated_by_user">;

export function formatUploadReceipt(
  row: ContextRow,
  orgProject: OrgProject,
  attribution: ReceiptAttribution
): UploadReceipt {
  return {
    context_id: row.id,
    org: orgProject.org_slug,
    project: orgProject.project_slug,
    title: row.title,
    source_workstream: row.source_workstream,
    target_workstreams: row.target_workstreams,
    domain: row.domain,
    code_areas: row.code_areas,
    context_type: row.context_type,
    status: row.status,
    version: row.version,
    created_at: row.created_at,
    content_hash: row.content_hash,
    author_note_md: row.author_note_md ?? null,
    author_note_source: row.author_note_source ?? null,
    author_note_updated_at: row.author_note_updated_at ?? null,
    author_note_updated_by: row.author_note_updated_by ?? null,
    created_by_user: attribution.created_by_user,
    updated_by_user: attribution.updated_by_user
  };
}
