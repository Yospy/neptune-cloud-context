import type {
  CreateContextRequest,
  CreateOrgRequest,
  CreateOrgResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  DeleteProjectResponse,
  GetContextResponse,
  ListOrgMembersResponse,
  ListOrgsResponse,
  ListProjectMembersResponse,
  ListProjectsQuery,
  ListProjectsResponse,
  MarkContextReadRequest,
  MarkContextReadResponse,
  MarkContextReferencedRequest,
  MarkContextReferencedResponse,
  MeResponse,
  RelevantContextQuery,
  RelevantContextResponse,
  RetrieveContextQuery,
  RetrieveContextResponse,
  ResolveContextRequest,
  ResolveContextResponse,
  UploadReceiptResponse
} from "neptune-context-shared";
import { refreshStoredAuth, shouldRefreshAuth } from "./auth.js";
import { loadConfig, updateConfig, type NeptuneConfig } from "./config.js";
import { requireSupabasePublicConfig, resolveNeptuneEnv } from "./env.js";
import { NeptuneSdkError, sdkErrorFromResponse } from "./errors.js";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Pick<Response, "ok" | "status" | "text">>;

export type NeptuneClientOptions = {
  configPath?: string;
  config?: NeptuneConfig;
  env?: NodeJS.ProcessEnv;
  fetch?: FetchLike;
  refreshAuth?: typeof refreshStoredAuth;
};

async function parseResponseBody(response: Pick<Response, "text">): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new NeptuneSdkError("VALIDATION_FAILED", "Backend response was not valid JSON.", {
      cause: error
    });
  }
}

async function loadApiConfig(options: NeptuneClientOptions = {}) {
  let stored = options.config ?? (await loadConfig(options.configPath));
  const env = resolveNeptuneEnv(options.env, stored);

  if (!stored.auth?.accessToken) {
    throw new NeptuneSdkError("AUTH_REQUIRED", "Not logged in. Run `neptune login` first.");
  }

  if (shouldRefreshAuth(stored.auth)) {
    const publicConfig = requireSupabasePublicConfig(env);
    const refreshed = await (options.refreshAuth ?? refreshStoredAuth)({
      ...publicConfig,
      auth: stored.auth
    });

    if (options.config) {
      stored = { ...stored, auth: refreshed };
    } else {
      stored = await updateConfig(
        (config) => ({
          ...config,
          auth: refreshed,
          supabaseUrl: publicConfig.supabaseUrl,
          supabaseAnonKey: publicConfig.supabaseAnonKey
        }),
        options.configPath
      );
    }
  }

  return {
    apiUrl: env.apiUrl,
    accessToken: stored.auth!.accessToken
  };
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: NeptuneClientOptions = {}
): Promise<T> {
  const config = await loadApiConfig(options);
  const url = new URL(path, config.apiUrl);
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${config.accessToken}`);

  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  let response: Pick<Response, "ok" | "status" | "text">;
  try {
    response = await (options.fetch ?? fetch)(url, { ...init, headers });
  } catch (error) {
    throw new NeptuneSdkError("NETWORK_ERROR", "Backend request failed before a response was received.", {
      cause: error
    });
  }

  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw sdkErrorFromResponse(response.status, body);
  }

  return body as T;
}

function queryString(query: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

export function getMe(options: NeptuneClientOptions = {}) {
  return apiRequest<MeResponse>("/me", {}, options);
}

export function listOrgs(options: NeptuneClientOptions = {}) {
  return apiRequest<ListOrgsResponse>("/orgs", {}, options);
}

export function createOrg(input: CreateOrgRequest, options?: NeptuneClientOptions): Promise<CreateOrgResponse>;
export function createOrg(slug: string, name: string, options?: NeptuneClientOptions): Promise<CreateOrgResponse>;
export function createOrg(
  inputOrSlug: CreateOrgRequest | string,
  nameOrOptions?: string | NeptuneClientOptions,
  maybeOptions?: NeptuneClientOptions
) {
  const input =
    typeof inputOrSlug === "string"
      ? { slug: inputOrSlug, name: String(nameOrOptions) }
      : inputOrSlug;
  const options = typeof inputOrSlug === "string" ? maybeOptions : (nameOrOptions as NeptuneClientOptions | undefined);

  return apiRequest<CreateOrgResponse>(
    "/orgs",
    {
      method: "POST",
      body: JSON.stringify(input)
    },
    options
  );
}

export function listOrgMembers(orgId: string, options: NeptuneClientOptions = {}) {
  return apiRequest<ListOrgMembersResponse>(`/orgs/${encodeURIComponent(orgId)}/members`, {}, options);
}

export function listProjects(query?: ListProjectsQuery, options?: NeptuneClientOptions): Promise<ListProjectsResponse>;
export function listProjects(orgId?: string, options?: NeptuneClientOptions): Promise<ListProjectsResponse>;
export function listProjects(
  queryOrOrgId?: ListProjectsQuery | string,
  options: NeptuneClientOptions = {}
) {
  const query = typeof queryOrOrgId === "string" ? { org_id: queryOrOrgId } : queryOrOrgId;
  return apiRequest<ListProjectsResponse>(`/projects${queryString(query ?? {})}`, {}, options);
}

export function createProject(input: CreateProjectRequest, options: NeptuneClientOptions = {}) {
  return apiRequest<CreateProjectResponse>(
    "/projects",
    {
      method: "POST",
      body: JSON.stringify(input)
    },
    options
  );
}

export function deleteProject(projectId: string, options: NeptuneClientOptions = {}) {
  return apiRequest<DeleteProjectResponse>(
    `/projects/${encodeURIComponent(projectId)}`,
    {
      method: "DELETE"
    },
    options
  );
}

export function listProjectMembers(projectId: string, options: NeptuneClientOptions = {}) {
  return apiRequest<ListProjectMembersResponse>(
    `/projects/${encodeURIComponent(projectId)}/members`,
    {},
    options
  );
}

export function createContext(input: CreateContextRequest, options: NeptuneClientOptions = {}) {
  return apiRequest<UploadReceiptResponse>(
    "/contexts",
    {
      method: "POST",
      body: JSON.stringify(input)
    },
    options
  );
}

export function listRelevantContext(query: RelevantContextQuery, options: NeptuneClientOptions = {}) {
  return apiRequest<RelevantContextResponse>(`/contexts/relevant${queryString(query)}`, {}, options);
}

export function retrieveContext(query: RetrieveContextQuery, options: NeptuneClientOptions = {}) {
  return apiRequest<RetrieveContextResponse>(`/contexts/retrieve${queryString(query)}`, {}, options);
}

export function getContext(contextId: string, options: NeptuneClientOptions = {}) {
  return apiRequest<GetContextResponse>(`/contexts/${encodeURIComponent(contextId)}`, {}, options);
}

export function markContextRead(
  contextId: string,
  input: Partial<MarkContextReadRequest> = {},
  options: NeptuneClientOptions = {}
) {
  return apiRequest<MarkContextReadResponse>(
    `/contexts/${encodeURIComponent(contextId)}/read`,
    {
      method: "POST",
      body: JSON.stringify(input)
    },
    options
  );
}

export function markContextReferenced(
  contextId: string,
  input: Partial<MarkContextReferencedRequest> = {},
  options: NeptuneClientOptions = {}
) {
  return apiRequest<MarkContextReferencedResponse>(
    `/contexts/${encodeURIComponent(contextId)}/reference`,
    {
      method: "POST",
      body: JSON.stringify(input)
    },
    options
  );
}

export function resolveContext(
  contextId: string,
  input: Partial<ResolveContextRequest> = {},
  options: NeptuneClientOptions = {}
) {
  return apiRequest<ResolveContextResponse>(
    `/contexts/${encodeURIComponent(contextId)}/resolve`,
    {
      method: "POST",
      body: JSON.stringify(input)
    },
    options
  );
}

export function createNeptuneClient(options: NeptuneClientOptions = {}) {
  return {
    apiRequest: <T>(path: string, init: RequestInit = {}) => apiRequest<T>(path, init, options),
    getMe: () => getMe(options),
    listOrgs: () => listOrgs(options),
    createOrg: (input: CreateOrgRequest) => createOrg(input, options),
    listOrgMembers: (orgId: string) => listOrgMembers(orgId, options),
    listProjects: (query?: ListProjectsQuery) => listProjects(query, options),
    createProject: (input: CreateProjectRequest) => createProject(input, options),
    deleteProject: (projectId: string) => deleteProject(projectId, options),
    listProjectMembers: (projectId: string) => listProjectMembers(projectId, options),
    createContext: (input: CreateContextRequest) => createContext(input, options),
    listRelevantContext: (query: RelevantContextQuery) => listRelevantContext(query, options),
    retrieveContext: (query: RetrieveContextQuery) => retrieveContext(query, options),
    getContext: (contextId: string) => getContext(contextId, options),
    markContextRead: (contextId: string, input: Partial<MarkContextReadRequest> = {}) =>
      markContextRead(contextId, input, options),
    markContextReferenced: (
      contextId: string,
      input: Partial<MarkContextReferencedRequest> = {}
    ) => markContextReferenced(contextId, input, options),
    resolveContext: (contextId: string, input: Partial<ResolveContextRequest> = {}) =>
      resolveContext(contextId, input, options)
  };
}

export type NeptuneClient = ReturnType<typeof createNeptuneClient>;
