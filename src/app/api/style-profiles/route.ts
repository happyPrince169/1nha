// ---------------------------------------------------------------------------
// /api/style-profiles — list (GET) + create (POST)
//
// Mobile-ready JSON API for the "Văn phong" workflow. Shares the exact same
// style-profiles service + auth/workspace context as the web Server Actions,
// so web and the future Expo app behave identically. Authenticated +
// organization-scoped; standard { ok, data } / { ok, error } envelope.
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import {
  listStyleProfiles,
  createStyleProfile,
  type CreateStyleProfileInput,
} from "@/lib/services/style-profiles";
import { jsonOk, jsonError } from "@/lib/api/responses";
import { validationError } from "@/lib/api/errors";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getRequestContext();
    const platform = request.nextUrl.searchParams.get("platform");
    const result = await listStyleProfiles(ctx, { platform });
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getRequestContext();

    let body: CreateStyleProfileInput;
    try {
      body = (await request.json()) as CreateStyleProfileInput;
    } catch {
      throw validationError("Body JSON không hợp lệ.");
    }

    const profile = await createStyleProfile(ctx, body);
    return jsonOk({ profile }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
