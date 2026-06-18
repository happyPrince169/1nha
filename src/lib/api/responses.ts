// ---------------------------------------------------------------------------
// Standard API response envelopes for route handlers.
//
// Success: { ok: true,  data: ... }
// Error:   { ok: false, error: { code, message } }
//
// Used by /api/* route handlers so the future Expo mobile app gets one stable
// JSON contract. Services never import this — they throw ApiError and the
// route handler serialises it via `jsonError`.
// ---------------------------------------------------------------------------
import { NextResponse } from "next/server";

import { API_ERROR_STATUS, toApiError } from "./errors";

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiErrorBody = {
  ok: false;
  error: { code: string; message: string };
};
export type ApiResponseBody<T> = ApiSuccess<T> | ApiErrorBody;

/** 200 (or custom) success envelope. */
export function jsonOk<T>(data: T, init?: { status?: number }): NextResponse {
  return NextResponse.json<ApiSuccess<T>>(
    { ok: true, data },
    { status: init?.status ?? 200 }
  );
}

/** Error envelope — maps any thrown value to its ApiError code + HTTP status. */
export function jsonError(err: unknown): NextResponse {
  const apiError = toApiError(err);
  return NextResponse.json<ApiErrorBody>(
    { ok: false, error: { code: apiError.code, message: apiError.message } },
    { status: API_ERROR_STATUS[apiError.code] }
  );
}
