// ---------------------------------------------------------------------------
// /api/generated-contents/[id] — fetch (GET) + update (PATCH)
//
// Authenticated + organization-scoped via the shared service. Cross-org /
// unknown ids resolve to NOT_FOUND. PATCH edits body / title / notes.
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import {
  getGeneratedContent,
  updateGeneratedContent,
  type UpdateGeneratedContentInput,
} from "@/lib/services/generated-content";
import { jsonOk, jsonError } from "@/lib/api/responses";
import { validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();
    const content = await getGeneratedContent(ctx, id);
    return jsonOk({ content });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();

    let body: UpdateGeneratedContentInput;
    try {
      body = (await request.json()) as UpdateGeneratedContentInput;
    } catch {
      throw validationError("Body JSON không hợp lệ.");
    }

    const content = await updateGeneratedContent(ctx, id, body);
    return jsonOk({ content });
  } catch (err) {
    return jsonError(err);
  }
}
