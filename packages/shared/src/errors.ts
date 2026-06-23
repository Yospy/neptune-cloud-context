export const errorCodes = [
  "AUTH_REQUIRED",
  "ORG_ACCESS_DENIED",
  "ORG_NOT_FOUND",
  "PROJECT_ACCESS_DENIED",
  "PROJECT_NOT_FOUND",
  "CONFLICT",
  "VALIDATION_FAILED",
  "RATE_LIMITED",
  "CONTEXT_NOT_FOUND",
  "NETWORK_ERROR",
  "INTERNAL_ERROR"
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export type ApiErrorResponse = {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
};
