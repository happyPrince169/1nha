// ---------------------------------------------------------------------------
// /api/generated-contents/[id]/archive — archive (POST)
//
// Sets status = 'archived' (never deletes). Authenticated + organization-scoped
// via the shared service; cross-org / unknown ids return NOT_FOUND.
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import { archiveGeneratedContent } from "@/lib/services/generated-content";
import { jsonOk, jsonError } from "@/lib/api/responses";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();
    const content = await archiveGeneratedContent(ctx, id);
    return jsonOk({ id: content.id, archived: true });
  } catch (err) {
    return jsonError(err);
  }
}
