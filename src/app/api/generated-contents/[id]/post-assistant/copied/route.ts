// ---------------------------------------------------------------------------
// /api/generated-contents/[id]/post-assistant/copied — mark copied (POST)
//
// Records that the broker copied the content text (manual workflow intent).
// Authenticated + organization-scoped; cross-org / unknown ids → NOT_FOUND.
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import { markContentCopied } from "@/lib/services/post-assistant";
import { jsonOk, jsonError } from "@/lib/api/responses";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();
    const { posting } = await markContentCopied(ctx, id);
    return jsonOk({ posting });
  } catch (err) {
    return jsonError(err);
  }
}
