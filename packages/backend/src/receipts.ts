import type { UploadReceipt } from "neptune-context-shared";
import type { ContextRow, OrgProject } from "./repository.js";

export function formatUploadReceipt(row: ContextRow, orgProject: OrgProject): UploadReceipt {
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
    content_hash: row.content_hash
  };
}
