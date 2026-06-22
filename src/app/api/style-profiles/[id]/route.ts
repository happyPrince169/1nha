// ---------------------------------------------------------------------------
// /api/style-profiles/[id] — fetch (GET) + update (PATCH) + delete (DELETE)
//
// Authenticated + organization-scoped via the shared service. Cross-org /
// unknown ids resolve to NOT_FOUND (never leaks another workspace's data).
//
// PATCH body: { name?, description?, is_default? } — at least one field.
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import {
  getStyleProfile,
  updateStyleProfile,
  deleteStyleProfile,
  type UpdateStyleProfileInput,
} from "@/lib/services/style-profiles";
import { jsonOk, jsonError } from "@/lib/api/responses";
import { validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();
    const profile = await getStyleProfile(ctx, id);
    return jsonOk({ profile });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();

    let body: UpdateStyleProfileInput;
    try {
      body = (await request.json()) as UpdateStyleProfileInput;
    } catch {
      throw validationError("Body JSON không hợp lệ.");
    }

    const profile = await updateStyleProfile(ctx, id, body);
    return jsonOk({ profile });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();
    const result = await deleteStyleProfile(ctx, id);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
