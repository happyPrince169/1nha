// ---------------------------------------------------------------------------
// Shared API error model
//
// Services throw `ApiError`; route handlers and Server Actions catch it and
// map it to a transport (JSON response / action state). Keeping the error
// vocabulary tiny and explicit makes both the web app and the future Expo
// mobile app behave predictably.
//
// Pure data + Error subclass — safe to import from server code anywhere. It
// has NO Next.js / Supabase dependency.
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

/** HTTP status for each error code. */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  INTERNAL_ERROR: 500,
};

/** Default user-facing (Vietnamese) message per code. Callers may override. */
const DEFAULT_MESSAGE: Record<ApiErrorCode, string> = {
  UNAUTHORIZED: "Bạn cần đăng nhập.",
  FORBIDDEN: "Bạn không có quyền truy cập.",
  NOT_FOUND: "Không tìm thấy dữ liệu.",
  VALIDATION_ERROR: "Dữ liệu không hợp lệ.",
  INTERNAL_ERROR: "Đã xảy ra lỗi. Vui lòng thử lại.",
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGE[code]);
    this.name = "ApiError";
    this.code = code;
  }
}

// Convenience constructors — keep call sites terse and readable.
export const unauthorized = (message?: string) =>
  new ApiError("UNAUTHORIZED", message);
export const forbidden = (message?: string) =>
  new ApiError("FORBIDDEN", message);
export const notFound = (message?: string) =>
  new ApiError("NOT_FOUND", message);
export const validationError = (message?: string) =>
  new ApiError("VALIDATION_ERROR", message);
export const internalError = (message?: string) =>
  new ApiError("INTERNAL_ERROR", message);

/** Narrow an unknown thrown value to ApiError, else wrap as INTERNAL_ERROR. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError("INTERNAL_ERROR");
}
