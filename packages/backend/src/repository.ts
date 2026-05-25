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
  ListOrgMembersResponse,
  ListOrgsResponse,
  ListProjectMembersResponse,
  ListProjectsQuery,
  ListProjectsResponse,
  MarkContextReferencedRequest,
  MeResponse,
  Priority,
  RelevantContextQuery,
  ResolveContextRequest,
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

type ProjectRow = {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  created_at: string;
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

  if (codeText.includes("23505") || codeText.toLowerCase().includes("duplicate key")) {
    throw new AppError("CONFLICT", "Resource already exists.");
  }

  throw new AppError("INTERNAL_ERROR", fallbackMessage);
}

function contextSummary(row: ContextRow): ContextSummary {
  return {
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
    content_hash: row.content_hash
  };
}

function contextRecord(row: ContextRow): ContextRecord {
  return {
    ...contextSummary(row),
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

function isUploadReceiptResponse(value: unknown): value is UploadReceiptResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as UploadReceiptResponse).ok === true &&
    typeof (value as UploadReceiptResponse).changed === "boolean" &&
    typeof (value as UploadReceiptResponse).receipt?.context_id === "string"
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

    if (!isUploadReceiptResponse(data)) {
      throw new AppError("INTERNAL_ERROR", "Invalid context receipt from database.");
    }

    return data;
  }

  async listRelevantContext(
    query: RelevantContextQuery,
    user: AuthenticatedUser
  ): Promise<ContextSummary[]> {
    await this.getOrgProjectForMember(query.project_id, user.id);

    let builder = table<any>(this.client, "contexts")
      .select("*")
      .eq("project_id", query.project_id)
      .eq("status", "active")
      .contains("target_workstreams", [query.target_workstream])
      .order("updated_at", { ascending: false })
      .limit(query.unread_only ? 50 : query.limit);

    if (query.domain) {
      builder = builder.eq("domain", query.domain);
    }

    if (query.context_type) {
      builder = builder.eq("context_type", query.context_type);
    }

    if (query.code_area) {
      builder = builder.contains("code_areas", [query.code_area]);
    }

    const { data, error } = (await builder) as QueryResult<ContextRow[]>;
    raiseOnError(error, "Failed to list relevant contexts.");

    let rows = data ?? [];

    if (query.unread_only && rows.length > 0) {
      const readContextIds = await this.getReadContextIds(
        rows.map((row) => row.id),
        user.id
      );
      rows = rows.filter((row) => !readContextIds.has(row.id));
    }

    return rows.slice(0, query.limit).map(contextSummary);
  }

  async getContext(contextId: string, user: AuthenticatedUser): Promise<ContextRecord> {
    const row = await this.getContextRow(contextId);
    await this.getOrgProjectForMember(row.project_id, user.id);
    return contextRecord(row);
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
