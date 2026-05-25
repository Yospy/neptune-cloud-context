import type { ApiErrorResponse, ErrorCode } from "neptune-context-shared";

export type NeptuneSdkErrorCode = ErrorCode | "PROJECT_NOT_BOUND";

export class NeptuneSdkError extends Error {
  readonly code: NeptuneSdkErrorCode;
  readonly status?: number;
  readonly details?: unknown;

  constructor(
    code: NeptuneSdkErrorCode,
    message: string,
    options: { status?: number; details?: unknown; cause?: unknown } = {}
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "NeptuneSdkError";
    this.code = code;
    this.status = options.status;
    this.details = options.details;
  }
}

function isErrorCode(value: unknown): value is ErrorCode {
  return (
    value === "AUTH_REQUIRED" ||
    value === "ORG_ACCESS_DENIED" ||
    value === "ORG_NOT_FOUND" ||
    value === "PROJECT_ACCESS_DENIED" ||
    value === "PROJECT_NOT_FOUND" ||
    value === "CONFLICT" ||
    value === "VALIDATION_FAILED" ||
    value === "CONTEXT_NOT_FOUND" ||
    value === "NETWORK_ERROR" ||
    value === "INTERNAL_ERROR"
  );
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { ok?: unknown; error?: { code?: unknown; message?: unknown } };
  return candidate.ok === false && isErrorCode(candidate.error?.code) && typeof candidate.error.message === "string";
}

export function sdkErrorFromResponse(status: number, body: unknown) {
  if (isApiErrorResponse(body)) {
    return new NeptuneSdkError(body.error.code, body.error.message, {
      status,
      details: body.error.details
    });
  }

  return new NeptuneSdkError(
    status === 401 ? "AUTH_REQUIRED" : "NETWORK_ERROR",
    `Backend request failed with status ${status}.`,
    { status }
  );
}
