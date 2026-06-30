// ---------------------------------------------------------------------------
// API client — talks to the Next.js /api routes with a Bearer access token.
//
// • Pulls the current access token from the Supabase session (auto-refreshed).
// • Sends `Authorization: Bearer <token>` — never logs the token.
// • Parses the standard { ok, data } / { ok, error } envelope.
// • Maps HTTP status + error.code to a typed ApiError the screens can branch on
//   (401 unauthenticated, 403 forbidden, 404 not found, 422 validation, ...).
// • Uses ONLY the public anon session — never the service-role key, and never a
//   direct database write.
// ---------------------------------------------------------------------------
import { supabase } from "./supabase";
import { API_BASE_URL } from "./env";
import type {
  ApiEnvelope,
  PropertyImagesResult,
  PropertyListResult,
  PropertyRecord,
} from "./types";

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "NETWORK_ERROR"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  readonly code: ApiErrorCode | string;
  readonly status: number;
  constructor(code: ApiErrorCode | string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

/** True for errors that mean "your session is no longer valid". */
export function isAuthError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.status === 401 ||
      err.code === "UNAUTHENTICATED" ||
      err.code === "UNAUTHORIZED")
  );
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new ApiError("UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", 401);
  }
  return token;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch {
    throw new ApiError(
      "NETWORK_ERROR",
      "Không thể kết nối máy chủ. Kiểm tra mạng và thử lại.",
      0
    );
  }

  let json: ApiEnvelope<T> | null = null;
  try {
    json = (await res.json()) as ApiEnvelope<T>;
  } catch {
    json = null;
  }

  if (json && json.ok === true) return json.data;

  const code = json && json.ok === false ? json.error.code : "INTERNAL_ERROR";
  const message =
    json && json.ok === false
      ? json.error.message
      : "Đã có lỗi xảy ra. Vui lòng thử lại.";
  throw new ApiError(code, message, res.status);
}

// ---------------------------------------------------------------------------
// Endpoint helpers (read-only in Phase 5A)
// ---------------------------------------------------------------------------
export function fetchProperties(
  signal?: AbortSignal
): Promise<PropertyListResult> {
  return request<PropertyListResult>("/api/properties", { signal });
}

export function fetchProperty(
  id: string,
  signal?: AbortSignal
): Promise<PropertyRecord> {
  return request<PropertyRecord>(`/api/properties/${id}`, { signal });
}

export function fetchPropertyImages(
  id: string,
  signal?: AbortSignal
): Promise<PropertyImagesResult> {
  return request<PropertyImagesResult>(`/api/properties/${id}/images`, {
    signal,
  });
}
