import type {
  ContextRecord,
  ContextStatus,
  ContextSummary,
  ContextType,
  CreateContextRequest,
  CreateOrgRequest,
  CreateOrgResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  DeleteProjectResponse,
  ListOrgMembersResponse,
  ListOrgsResponse,
  ListProjectMembersResponse,
  ListProjectsQuery,
  ListProjectsResponse,
  MarkContextReferencedRequest,
  MeResponse,
  Priority,
  RelevantContextQuery,
  RetrieveContextQuery,
  ResolveContextRequest,
  UpdateContextAuthorNoteRequest,
  UpdateContextAuthorNoteResponse,
  UploadReceipt,
  UploadReceiptResponse,
  UserProfile,
  Workstream
} from "neptune-context-shared";
import { AppError } from "./app-error.js";
import { hashMarkdown } from "./hash.js";
import type { AuthenticatedUser, ContextRepository } from "./types.js";

type QueryResult<T> = {
  data: T | null;
  error: DbError | null;
};

type DbError = {
  message?: string;
  code?: string;
};

type SupabaseLike = {
  from: (table: string) => unknown;
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<QueryResult<unknown>>;
};

export type OrgProject = {
  org_id: string;
  org_slug: string;
  project_id: string;
  project_slug: string;
};

export type ContextRow = {
  id: string;
  org_id: string;
  project_id: string;
  title: string;
  summary: string;
  content_md: string;
  content_hash: string;
  source_workstream: Workstream;
  target_workstreams: Workstream[];
  domain: string;
  code_areas: string[];
  context_type: ContextType;
  priority: Priority;
  status: ContextStatus;
  repo_paths: string[];
  related_files: string[];
  tags: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  version: number;
  confidence_score?: number | null;
  inference_notes?: string | null;
  author_note_md?: string | null;
  author_note_source?: UploadReceipt["author_note_source"];
  author_note_updated_at?: string | null;
  author_note_updated_by?: string | null;
  score?: number | null;
  match_kind?: "full_text" | "hint" | "recent" | null;
  match_reason?: string | null;
};

type ProjectMemberRow = {
  org_id: string;
  project_id: string;
  user_id?: string;
  role?: "admin" | "editor" | "viewer";
  default_workstream?: Workstream | null;
  created_at?: string;
};

type OrgMemberRow = {
  org_id: string;
  user_id?: string;
  role: "owner" | "admin" | "member";
  created_at?: string;
};

type UserProfileRow = {
  id: string;
  email?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  provider?: string | null;
  last_seen_at?: string | null;
  created_at: string;
  updated_at: string;
};

type ContextVersionRow = {
  context_id: string;
  version: number;
  created_by: string;
};

type ProjectRow = {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  created_at: string;
};

type RawUploadReceipt = Omit<UploadReceipt, "created_by_user" | "updated_by_user">;

type RawUploadReceiptResponse = {
  ok: true;
  changed: boolean;
  receipt: RawUploadReceipt;
};

type ContextAttribution = {
  created_by_user: UserProfile;
  updated_by_user: UserProfile;
};

type OrgRow = {
  id: string;
  slug: string;
  name: string;
  created_at: string;
};

function table<T = unknown>(client: SupabaseLike, name: string): T {
  return client.from(name) as T;
}

function dbErrorCode(error: DbError): string {
  return `${error.message ?? ""} ${error.code ?? ""}`;
}

function raiseOnError(error: DbError | null, fallbackMessage: string): void {
  if (!error) return;

  const codeText = dbErrorCode(error);

  if (codeText.includes("ORG_ACCESS_DENIED")) {
    throw new AppError("ORG_ACCESS_DENIED", "Org access denied.");
  }

  if (codeText.includes("ORG_NOT_FOUND")) {
    throw new AppError("ORG_NOT_FOUND", "Org not found.");
  }

  if (codeText.includes("PROJECT_ACCESS_DENIED")) {
    throw new AppError("PROJECT_ACCESS_DENIED", "Project access denied.");
  }

  if (codeText.includes("PROJECT_NOT_FOUND")) {
    throw new AppError("PROJECT_NOT_FOUND", "Project not found.");
  }

  if (codeText.includes("CONTEXT_NOT_FOUND")) {
    throw new AppError("CONTEXT_NOT_FOUND", "Context not found.");
  }

  if (codeText.includes("AUTHOR_NOTE_ACCESS_DENIED")) {
    throw new AppError("AUTHOR_NOTE_ACCESS_DENIED", "Only the context author can update the author note.");
  }

  if (codeText.includes("VALIDATION_FAILED")) {
    throw new AppError("VALIDATION_FAILED", "Request validation failed.");
  }

  if (codeText.includes("23505") || codeText.toLowerCase().includes("duplicate key")) {
    throw new AppError("CONFLICT", "Resource already exists.");
  }

  throw new AppError("INTERNAL_ERROR", fallbackMessage);
}

function contextSummary(row: ContextRow, attribution: ContextAttribution): ContextSummary {
  const summary: ContextSummary = {
    id: row.id,
    title: row.title,
    summary: row.summary,
    source_workstream: row.source_workstream,
    target_workstreams: row.target_workstreams,
    domain: row.domain,
    code_areas: row.code_areas,
    context_type: row.context_type,
    priority: row.priority,
    status: row.status,
    updated_at: row.updated_at,
    version: row.version,
    content_hash: row.content_hash,
    author_note_md: row.author_note_md ?? null,
    author_note_source: row.author_note_source ?? null,
    author_note_updated_at: row.author_note_updated_at ?? null,
    author_note_updated_by: row.author_note_updated_by ?? null,
    created_by_user: attribution.created_by_user,
    updated_by_user: attribution.updated_by_user
  };

  if (row.match_reason) {
    summary.match_reason = row.match_reason;
  }

  if (row.score !== undefined && row.score !== null) {
    summary.score = Number(row.score);
  }

  if (row.match_kind) {
    summary.match_kind = row.match_kind;
  }

  return summary;
}

function contextRecord(row: ContextRow, attribution: ContextAttribution): ContextRecord {
  return {
    ...contextSummary(row, attribution),
    content_md: row.content_md,
    created_at: row.created_at,
    repo_paths: row.repo_paths,
    related_files: row.related_files,
    tags: row.tags
  };
}

function userProfile(row: UserProfileRow): UserProfile {
  return {
    id: row.id,
    email: row.email ?? null,
    display_name: row.display_name ?? null,
    avatar_url: row.avatar_url ?? null,
    provider: row.provider ?? null,
    last_seen_at: row.last_seen_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function isRawUploadReceiptResponse(value: unknown): value is RawUploadReceiptResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as RawUploadReceiptResponse).ok === true &&
    typeof (value as RawUploadReceiptResponse).changed === "boolean" &&
    typeof (value as RawUploadReceiptResponse).receipt?.context_id === "string"
  );
}

function orgResponse(value: unknown): CreateOrgResponse {
  const response = value as CreateOrgResponse;
  if (response?.ok !== true || typeof response.org?.id !== "string") {
    throw new AppError("INTERNAL_ERROR", "Invalid org response from database.");
  }
  return response;
}

function projectResponse(value: unknown): CreateProjectResponse {
  const response = value as CreateProjectResponse;
  if (response?.ok !== true || typeof response.project?.id !== "string") {
    throw new AppError("INTERNAL_ERROR", "Invalid project response from database.");
  }
  return response;
}

export class SupabaseContextRepository implements ContextRepository {
  constructor(private readonly client: SupabaseLike) {}

  async upsertUserProfile(user: AuthenticatedUser): Promise<void> {
    const values: Record<string, unknown> = {
      id: user.id,
      last_seen_at: new Date().toISOString()
    };

    if (user.email !== undefined) values.email = user.email;
    if (user.display_name) values.display_name = user.display_name;
    if (user.avatar_url) values.avatar_url = user.avatar_url;
    if (user.provider) values.provider = user.provider;

    const { error } = (await table<any>(this.client, "user_profiles").upsert(values, {
      onConflict: "id"
    })) as QueryResult<unknown>;

    raiseOnError(error, "Failed to sync user profile.");
  }

  async getMe(user: AuthenticatedUser): Promise<MeResponse> {
    return {
      ok: true,
      user: await this.getUserProfile(user.id),
      orgs: (await this.listOrgs(user)).orgs,
      projects: (await this.listProjects({}, user)).projects
    };
  }

  async listOrgs(user: AuthenticatedUser): Promise<ListOrgsResponse> {
    const { data: memberships, error: membershipError } = (await table<any>(
      this.client,
      "org_members"
    )
      .select("org_id, role")
      .eq("user_id", user.id)) as QueryResult<OrgMemberRow[]>;

    raiseOnError(membershipError, "Failed to list org memberships.");

    const orgIds = (memberships ?? []).map((membership) => membership.org_id);
    if (orgIds.length === 0) {
      return { ok: true, orgs: [] };
    }

    const { data: orgs, error: orgsError } = (await table<any>(this.client, "orgs")
      .select("id, slug, name, created_at")
      .in("id", orgIds)) as QueryResult<OrgRow[]>;

    raiseOnError(orgsError, "Failed to list orgs.");

    const roleByOrg = new Map((memberships ?? []).map((row) => [row.org_id, row.role]));

    return {
      ok: true,
      orgs: (orgs ?? []).map((org) => ({
        id: org.id,
        slug: org.slug,
        name: org.name,
        role: roleByOrg.get(org.id) ?? "member",
        created_at: org.created_at
      }))
    };
  }

  async createOrg(input: CreateOrgRequest, user: AuthenticatedUser): Promise<CreateOrgResponse> {
    const { data, error } = await this.client.rpc("neptune_create_org", {
      p_actor_user_id: user.id,
      p_slug: input.slug,
      p_name: input.name
    });

    raiseOnError(error, "Failed to create org.");
    return orgResponse(data);
  }

  async listOrgMembers(orgId: string, user: AuthenticatedUser): Promise<ListOrgMembersResponse> {
    await this.getOrgForMember(orgId, user.id);

    const { data: members, error } = (await table<any>(this.client, "org_members")
      .select("org_id, user_id, role, created_at")
      .eq("org_id", orgId)) as QueryResult<OrgMemberRow[]>;

    raiseOnError(error, "Failed to list org members.");

    const profiles = await this.getUserProfiles(
      (members ?? []).flatMap((member) => (member.user_id ? [member.user_id] : []))
    );

    return {
      ok: true,
      members: (members ?? []).map((member) => ({
        user: profiles.get(member.user_id ?? "") ?? this.missingProfile(member.user_id),
        role: member.role,
        created_at: member.created_at ?? ""
      }))
    };
  }

  async listProjects(
    query: ListProjectsQuery,
    user: AuthenticatedUser
  ): Promise<ListProjectsResponse> {
    let builder = table<any>(this.client, "project_members")
      .select("org_id, project_id, role, default_workstream")
      .eq("user_id", user.id);

    if (query.org_id) {
      builder = builder.eq("org_id", query.org_id);
    }

    const { data: memberships, error: membershipError } =
      (await builder) as QueryResult<ProjectMemberRow[]>;

    raiseOnError(membershipError, "Failed to list project memberships.");

    const projectIds = (memberships ?? []).map((membership) => membership.project_id);
    if (projectIds.length === 0) {
      return { ok: true, projects: [] };
    }

    const { data: projects, error: projectsError } = (await table<any>(this.client, "projects")
      .select("id, org_id, slug, name, created_at")
      .in("id", projectIds)) as QueryResult<ProjectRow[]>;

    raiseOnError(projectsError, "Failed to list projects.");

    const membershipByProject = new Map(
      (memberships ?? []).map((row) => [row.project_id, row])
    );

    return {
      ok: true,
      projects: (projects ?? []).map((project) => {
        const membership = membershipByProject.get(project.id);
        return {
          id: project.id,
          org_id: project.org_id,
          slug: project.slug,
          name: project.name,
          role: membership?.role ?? "viewer",
          default_workstream: membership?.default_workstream ?? "general",
          created_at: project.created_at
        };
      })
    };
  }

  async createProject(
    input: CreateProjectRequest,
    user: AuthenticatedUser
  ): Promise<CreateProjectResponse> {
    const { data, error } = await this.client.rpc("neptune_create_project", {
      p_actor_user_id: user.id,
      p_org_id: input.org_id,
      p_slug: input.slug,
      p_name: input.name,
      p_default_workstream: input.default_workstream
    });

    raiseOnError(error, "Failed to create project.");
    return projectResponse(data);
  }

  async deleteProject(
    projectId: string,
    user: AuthenticatedUser
  ): Promise<DeleteProjectResponse> {
    const { data: membership, error: membershipError } = (await table<any>(
      this.client,
      "project_members"
    )
      .select("org_id, project_id, role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle()) as QueryResult<ProjectMemberRow>;

    raiseOnError(membershipError, "Failed to verify project membership.");

    if (!membership || membership.role !== "admin") {
      throw new AppError("PROJECT_ACCESS_DENIED", "Project access denied.");
    }

    const { error } = (await table<any>(this.client, "projects")
      .delete()
      .eq("id", projectId)
      .eq("org_id", membership.org_id)) as QueryResult<null>;

    raiseOnError(error, "Failed to delete project.");

    return { ok: true };
  }

  async listProjectMembers(
    projectId: string,
    user: AuthenticatedUser
  ): Promise<ListProjectMembersResponse> {
    await this.getOrgProjectForMember(projectId, user.id);

    const { data: members, error } = (await table<any>(this.client, "project_members")
      .select("org_id, project_id, user_id, role, default_workstream, created_at")
      .eq("project_id", projectId)) as QueryResult<ProjectMemberRow[]>;

    raiseOnError(error, "Failed to list project members.");

    const profiles = await this.getUserProfiles(
      (members ?? []).flatMap((member) => (member.user_id ? [member.user_id] : []))
    );

    return {
      ok: true,
      members: (members ?? []).map((member) => ({
        user: profiles.get(member.user_id ?? "") ?? this.missingProfile(member.user_id),
        role: member.role ?? "viewer",
        default_workstream: member.default_workstream ?? "general",
        created_at: member.created_at ?? ""
      }))
    };
  }

  async createContext(
    input: CreateContextRequest,
    user: AuthenticatedUser
  ): Promise<UploadReceiptResponse> {
    const { data, error } = await this.client.rpc("neptune_upsert_context", {
      p_actor_user_id: user.id,
      p_payload: {
        ...input,
        content_hash: hashMarkdown(input.content_md)
      }
    });

    raiseOnError(error, "Failed to create context.");

    if (!isRawUploadReceiptResponse(data)) {
      throw new AppError("INTERNAL_ERROR", "Invalid context receipt from database.");
    }

    return this.enrichUploadReceipt(data);
  }

  async updateContextAuthorNote(
    contextId: string,
    user: AuthenticatedUser,
    input: UpdateContextAuthorNoteRequest
  ): Promise<UpdateContextAuthorNoteResponse> {
    const { data, error } = await this.client.rpc("neptune_update_context_author_note", {
      p_actor_user_id: user.id,
      p_context_id: contextId,
      p_author_note_md: input.author_note_md,
      p_author_note_source: input.author_note_source
    });

    raiseOnError(error, "Failed to update context author note.");

    const response = data as UpdateContextAuthorNoteResponse;
    if (response?.ok !== true) {
      throw new AppError("INTERNAL_ERROR", "Invalid author note response from database.");
    }

    return response;
  }

  async listRelevantContext(
    query: RelevantContextQuery,
    user: AuthenticatedUser
  ): Promise<ContextSummary[]> {
    const { data, error } = (await this.client.rpc("neptune_list_relevant_context", {
      p_actor_user_id: user.id,
      p_project_id: query.project_id,
      p_target_workstream: query.target_workstream,
      p_query: query.query ?? null,
      p_domain: query.domain ?? null,
      p_code_area: query.code_area ?? null,
      p_context_type: query.context_type ?? null,
      p_updated_after: query.updated_after ?? null,
      p_unread_only: query.unread_only,
      p_limit: query.limit
    })) as QueryResult<ContextRow[]>;
    raiseOnError(error, "Failed to list relevant contexts.");

    const limitedRows = data ?? [];
    const attribution = await this.getContextAttribution(limitedRows);

    return limitedRows.map((row) => contextSummary(row, this.requireAttribution(row, attribution)));
  }

  async retrieveContext(
    query: RetrieveContextQuery,
    user: AuthenticatedUser
  ): Promise<ContextSummary[]> {
    const { data, error } = (await this.client.rpc("neptune_retrieve_context", {
      p_actor_user_id: user.id,
      p_project_id: query.project_id,
      p_intent: query.intent ?? null,
      p_mode: query.mode,
      p_target_workstream: query.target_workstream ?? null,
      p_domain: query.domain ?? null,
      p_code_area: query.code_area ?? null,
      p_context_type: query.context_type ?? null,
      p_limit: query.limit
    })) as QueryResult<ContextRow[]>;
    raiseOnError(error, "Failed to retrieve contexts.");

    const limitedRows = data ?? [];
    const attribution = await this.getContextAttribution(limitedRows);

    return limitedRows.map((row) => contextSummary(row, this.requireAttribution(row, attribution)));
  }

  async getContext(contextId: string, user: AuthenticatedUser): Promise<ContextRecord> {
    const row = await this.getContextRow(contextId);
    await this.getOrgProjectForMember(row.project_id, user.id);
    const attribution = await this.getContextAttribution([row]);
    return contextRecord(row, this.requireAttribution(row, attribution));
  }

  async markContextRead(
    contextId: string,
    user: AuthenticatedUser,
    agentName: string
  ): Promise<void> {
    const row = await this.getContextRow(contextId);
    await this.getOrgProjectForMember(row.project_id, user.id);

    const { error } = (await table<any>(this.client, "context_reads").upsert(
      {
        context_id: row.id,
        org_id: row.org_id,
        project_id: row.project_id,
        user_id: user.id,
        agent_name: agentName,
        read_at: new Date().toISOString()
      },
      { onConflict: "context_id,user_id,agent_name" }
    )) as QueryResult<unknown>;

    raiseOnError(error, "Failed to mark context read.");
  }

  async markContextReferenced(
    contextId: string,
    user: AuthenticatedUser,
    input: MarkContextReferencedRequest
  ): Promise<void> {
    const { error } = await this.client.rpc("neptune_reference_context", {
      p_actor_user_id: user.id,
      p_context_id: contextId,
      p_agent_name: input.agent_name,
      p_note: input.note ?? null,
      p_repo_path: input.repo_path ?? null,
      p_git_commit: input.git_commit ?? null
    });

    raiseOnError(error, "Failed to mark context referenced.");
  }

  async resolveContext(
    contextId: string,
    user: AuthenticatedUser,
    input: ResolveContextRequest
  ): Promise<void> {
    const { error } = await this.client.rpc("neptune_resolve_context", {
      p_actor_user_id: user.id,
      p_context_id: contextId,
      p_agent_name: input.agent_name,
      p_note: input.note ?? null
    });

    raiseOnError(error, "Failed to resolve context.");
  }

  private async getOrgProjectForMember(projectId: string, userId: string): Promise<OrgProject> {
    const { data: membership, error: membershipError } = (await table<any>(
      this.client,
      "project_members"
    )
      .select("org_id, project_id")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle()) as QueryResult<ProjectMemberRow>;

    raiseOnError(membershipError, "Failed to verify project membership.");

    if (!membership) {
      throw new AppError("PROJECT_ACCESS_DENIED", "Project access denied.");
    }

    const { data: project, error: projectError } = (await table<any>(this.client, "projects")
      .select("id, org_id, slug")
      .eq("id", projectId)
      .maybeSingle()) as QueryResult<ProjectRow>;

    raiseOnError(projectError, "Failed to load project.");

    const { data: org, error: orgError } = (await table<any>(this.client, "orgs")
      .select("id, slug")
      .eq("id", membership.org_id)
      .maybeSingle()) as QueryResult<OrgRow>;

    raiseOnError(orgError, "Failed to load org.");

    if (!project || !org || project.org_id !== membership.org_id) {
      throw new AppError("PROJECT_ACCESS_DENIED", "Project access denied.");
    }

    return {
      org_id: membership.org_id,
      org_slug: org.slug,
      project_id: project.id,
      project_slug: project.slug
    };
  }

  private async getOrgForMember(orgId: string, userId: string): Promise<OrgRow> {
    const { data: org, error: orgError } = (await table<any>(this.client, "orgs")
      .select("id, slug, name, created_at")
      .eq("id", orgId)
      .maybeSingle()) as QueryResult<OrgRow>;

    raiseOnError(orgError, "Failed to load org.");

    if (!org) {
      throw new AppError("ORG_NOT_FOUND", "Org not found.");
    }

    const { data: membership, error: membershipError } = (await table<any>(
      this.client,
      "org_members"
    )
      .select("org_id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle()) as QueryResult<OrgMemberRow>;

    raiseOnError(membershipError, "Failed to verify org membership.");

    if (!membership) {
      throw new AppError("ORG_ACCESS_DENIED", "Org access denied.");
    }

    return org;
  }

  private async getUserProfile(userId: string): Promise<UserProfile> {
    const { data, error } = (await table<any>(this.client, "user_profiles")
      .select("id, email, display_name, avatar_url, provider, last_seen_at, created_at, updated_at")
      .eq("id", userId)
      .maybeSingle()) as QueryResult<UserProfileRow>;

    raiseOnError(error, "Failed to load user profile.");

    if (!data) {
      throw new AppError("INTERNAL_ERROR", "User profile not found.");
    }

    return userProfile(data);
  }

  private async getUserProfiles(userIds: string[]): Promise<Map<string, UserProfile>> {
    const uniqueUserIds = [...new Set(userIds)];
    if (uniqueUserIds.length === 0) {
      return new Map();
    }

    const { data, error } = (await table<any>(this.client, "user_profiles")
      .select("id, email, display_name, avatar_url, provider, last_seen_at, created_at, updated_at")
      .in("id", uniqueUserIds)) as QueryResult<UserProfileRow[]>;

    raiseOnError(error, "Failed to load user profiles.");

    return new Map((data ?? []).map((row) => [row.id, userProfile(row)]));
  }

  private async enrichUploadReceipt(
    response: RawUploadReceiptResponse
  ): Promise<UploadReceiptResponse> {
    const row = await this.getContextRow(response.receipt.context_id);
    const attribution = this.requireAttribution(row, await this.getContextAttribution([row]));

    return {
      ...response,
      receipt: {
        ...response.receipt,
        author_note_md: row.author_note_md ?? null,
        author_note_source: row.author_note_source ?? null,
        author_note_updated_at: row.author_note_updated_at ?? null,
        author_note_updated_by: row.author_note_updated_by ?? null,
        created_by_user: attribution.created_by_user,
        updated_by_user: attribution.updated_by_user
      }
    };
  }

  private async getContextAttribution(
    rows: ContextRow[]
  ): Promise<Map<string, ContextAttribution>> {
    if (rows.length === 0) {
      return new Map();
    }

    const { data: versions, error } = (await table<any>(this.client, "context_versions")
      .select("context_id, version, created_by")
      .in(
        "context_id",
        rows.map((row) => row.id)
      )) as QueryResult<ContextVersionRow[]>;

    raiseOnError(error, "Failed to load context versions.");

    const versionActorByContext = new Map(
      (versions ?? []).map((version) => [
        `${version.context_id}:${version.version}`,
        version.created_by
      ])
    );

    const updatedByByContext = new Map(
      rows.map((row) => [row.id, this.updatedByUserId(row, versionActorByContext)])
    );
    const userIds = [
      ...new Set([
        ...rows.map((row) => row.created_by),
        ...rows.map((row) => updatedByByContext.get(row.id) ?? row.created_by)
      ])
    ];
    const profiles = await this.getUserProfiles(userIds);

    return new Map(
      rows.map((row) => {
        const updatedBy = updatedByByContext.get(row.id) ?? row.created_by;
        return [
          row.id,
          {
            created_by_user: profiles.get(row.created_by) ?? this.missingProfile(row.created_by),
            updated_by_user: profiles.get(updatedBy) ?? this.missingProfile(updatedBy)
          }
        ];
      })
    );
  }

  private updatedByUserId(row: ContextRow, versionActorByContext: Map<string, string>) {
    const currentVersionActor = versionActorByContext.get(`${row.id}:${row.version}`);
    if (currentVersionActor) {
      return currentVersionActor;
    }

    if (row.version === 1) {
      return row.created_by;
    }

    throw new AppError(
      "INTERNAL_ERROR",
      `Context version attribution not found for ${row.id} v${row.version}.`
    );
  }

  private requireAttribution(
    row: ContextRow,
    attribution: Map<string, ContextAttribution>
  ): ContextAttribution {
    const value = attribution.get(row.id);
    if (!value) {
      throw new AppError("INTERNAL_ERROR", `Context attribution not found for ${row.id}.`);
    }
    return value;
  }

  private missingProfile(userId?: string): UserProfile {
    if (!userId) {
      throw new AppError("INTERNAL_ERROR", "Member row is missing a user id.");
    }

    throw new AppError("INTERNAL_ERROR", `User profile not found for ${userId}.`);
  }

  private async getContextRow(contextId: string): Promise<ContextRow> {
    const { data, error } = (await table<any>(this.client, "contexts")
      .select("*")
      .eq("id", contextId)
      .maybeSingle()) as QueryResult<ContextRow>;

    raiseOnError(error, "Failed to load context.");

    if (!data) {
      throw new AppError("CONTEXT_NOT_FOUND", "Context not found.");
    }

    return data;
  }

  private async getReadContextIds(contextIds: string[], userId: string): Promise<Set<string>> {
    const { data, error } = (await table<any>(this.client, "context_reads")
      .select("context_id")
      .eq("user_id", userId)
      .in("context_id", contextIds)) as QueryResult<Array<{ context_id: string }>>;

    raiseOnError(error, "Failed to load context reads.");

    return new Set((data ?? []).map((row) => row.context_id));
  }
}
