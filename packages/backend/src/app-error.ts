import type { ApiErrorResponse, ErrorCode } from "neptune-context-shared";

const statusByCode: Record<ErrorCode, number> = {
  AUTH_REQUIRED: 401,
  ORG_ACCESS_DENIED: 403,
  ORG_NOT_FOUND: 404,
  PROJECT_ACCESS_DENIED: 403,
  PROJECT_NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_FAILED: 400,
  RATE_LIMITED: 429,
  CONTEXT_NOT_FOUND: 404,
  NETWORK_ERROR: 502,
  INTERNAL_ERROR: 500
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = statusByCode[code];
    this.details = details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toErrorResponse(error: AppError): ApiErrorResponse {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details })
    }
  };
}
