import type {
  ContextRecord,
  ContextSummary,
  CreateOrgRequest,
  CreateOrgResponse,
  CreateContextRequest,
  CreateProjectRequest,
  CreateProjectResponse,
  DeleteProjectResponse,
  ErrorCode,
  ListOrgMembersResponse,
  ListOrgsResponse,
  ListProjectMembersResponse,
  ListProjectsQuery,
  ListProjectsResponse,
  MarkContextReferencedRequest,
  MeResponse,
  RelevantContextQuery,
  RetrieveContextQuery,
  ResolveContextRequest,
  UploadReceiptResponse
} from "neptune-context-shared";
import type { Logger } from "pino";

export type BackendEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  port: number;
  nodeEnv: "development" | "test" | "production";
  logLevel: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent";
  logPretty: boolean;
  healthLogIntervalMs: number;
};

export type AuthenticatedUser = {
  id: string;
  email?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  provider?: string | null;
};

export type AuthUserMetadata = Record<string, unknown>;

export type AuthClientLike = {
  auth: {
    getUser: (jwt: string) => Promise<{
      data: {
        user: {
          id: string;
          email?: string | null;
          user_metadata?: AuthUserMetadata;
          app_metadata?: AuthUserMetadata;
        } | null;
      };
      error: unknown | null;
    }>;
  };
};

export type ContextRepository = {
  upsertUserProfile: (user: AuthenticatedUser) => Promise<void>;
  getMe: (user: AuthenticatedUser) => Promise<MeResponse>;
  listOrgs: (user: AuthenticatedUser) => Promise<ListOrgsResponse>;
  createOrg: (input: CreateOrgRequest, user: AuthenticatedUser) => Promise<CreateOrgResponse>;
  listOrgMembers: (orgId: string, user: AuthenticatedUser) => Promise<ListOrgMembersResponse>;
  listProjects: (
    query: ListProjectsQuery,
    user: AuthenticatedUser
  ) => Promise<ListProjectsResponse>;
  createProject: (
    input: CreateProjectRequest,
    user: AuthenticatedUser
  ) => Promise<CreateProjectResponse>;
  deleteProject: (
    projectId: string,
    user: AuthenticatedUser
  ) => Promise<DeleteProjectResponse>;
  listProjectMembers: (
    projectId: string,
    user: AuthenticatedUser
  ) => Promise<ListProjectMembersResponse>;
  createContext: (
    input: CreateContextRequest,
    user: AuthenticatedUser
  ) => Promise<UploadReceiptResponse>;
  listRelevantContext: (
    query: RelevantContextQuery,
    user: AuthenticatedUser
  ) => Promise<ContextSummary[]>;
  retrieveContext: (
    query: RetrieveContextQuery,
    user: AuthenticatedUser
  ) => Promise<ContextSummary[]>;
  getContext: (contextId: string, user: AuthenticatedUser) => Promise<ContextRecord>;
  markContextRead: (
    contextId: string,
    user: AuthenticatedUser,
    agentName: string
  ) => Promise<void>;
  markContextReferenced: (
    contextId: string,
    user: AuthenticatedUser,
    input: MarkContextReferencedRequest
  ) => Promise<void>;
  resolveContext: (
    contextId: string,
    user: AuthenticatedUser,
    input: ResolveContextRequest
  ) => Promise<void>;
};

export type AppVariables = {
  logger: Logger;
  requestId: string;
  errorCode?: ErrorCode;
  rateLimitRules?: Set<string>;
  user: AuthenticatedUser;
};
