import type { ContextStatus, ContextType, Priority, Workstream } from "./enums.js";

export type OrgSummary = {
  id: string;
  slug: string;
  name: string;
  role: "owner" | "admin" | "member";
  created_at: string;
};

export type ProjectSummary = {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  role: "admin" | "editor" | "viewer";
  default_workstream: Workstream;
  created_at: string;
};

export type UserProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  provider: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrgMemberSummary = {
  user: UserProfile;
  role: "owner" | "admin" | "member";
  created_at: string;
};

export type ProjectMemberSummary = {
  user: UserProfile;
  role: "admin" | "editor" | "viewer";
  default_workstream: Workstream;
  created_at: string;
};

export type UploadReceipt = {
  context_id: string;
  org: string;
  project: string;
  title: string;
  source_workstream: Workstream;
  target_workstreams: Workstream[];
  domain: string;
  code_areas: string[];
  context_type: ContextType;
  status: ContextStatus;
  version: number;
  created_at: string;
  content_hash: string;
  created_by_user: UserProfile;
  updated_by_user: UserProfile;
};

export type UploadReceiptResponse = {
  ok: true;
  changed: boolean;
  receipt: UploadReceipt;
};

export type ContextSummary = {
  id: string;
  title: string;
  summary: string;
  source_workstream: Workstream;
  target_workstreams: Workstream[];
  domain: string;
  code_areas: string[];
  context_type: ContextType;
  priority: Priority;
  status: ContextStatus;
  updated_at: string;
  version: number;
  content_hash: string;
  created_by_user: UserProfile;
  updated_by_user: UserProfile;
};

export type ContextRecord = ContextSummary & {
  content_md: string;
  created_at: string;
  repo_paths: string[];
  related_files: string[];
  tags: string[];
};

export type RelevantContextResponse = {
  ok: true;
  contexts: ContextSummary[];
};

export type GetContextResponse = {
  ok: true;
  context: ContextRecord;
};

export type MarkContextReadResponse = {
  ok: true;
};

export type ListOrgsResponse = {
  ok: true;
  orgs: OrgSummary[];
};

export type CreateOrgResponse = {
  ok: true;
  org: OrgSummary;
};

export type ListProjectsResponse = {
  ok: true;
  projects: ProjectSummary[];
};

export type CreateProjectResponse = {
  ok: true;
  project: ProjectSummary;
};

export type MeResponse = {
  ok: true;
  user: UserProfile;
  orgs: OrgSummary[];
  projects: ProjectSummary[];
};

export type ListOrgMembersResponse = {
  ok: true;
  members: OrgMemberSummary[];
};

export type ListProjectMembersResponse = {
  ok: true;
  members: ProjectMemberSummary[];
};

export type MarkContextReferencedResponse = {
  ok: true;
};

export type ResolveContextResponse = {
  ok: true;
};
