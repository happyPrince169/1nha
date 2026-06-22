// ---------------------------------------------------------------------------
// /api/generated-contents/[id]/post-assistant/posted — mark posted (POST)
//
// Records that the broker posted the content MANUALLY, plus optional channel /
// link / time for history. 1nha never posts on the user's behalf.
// Body (optional): { postedAt?, channelName?, postUrl? }
// Authenticated + organization-scoped; cross-org / unknown ids → NOT_FOUND.
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import {
  markContentPosted,
  type MarkPostedInput,
} from "@/lib/services/post-assistant";
import { jsonOk, jsonError } from "@/lib/api/responses";
import { validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();

    // Body is optional; tolerate an empty/missing body.
    let body: MarkPostedInput = {};
    const text = await request.text();
    if (text.trim().length > 0) {
      try {
        body = JSON.parse(text) as MarkPostedInput;
      } catch {
        throw validationError("Body JSON không hợp lệ.");
      }
    }

    const { posting } = await markContentPosted(ctx, id, body);
    return jsonOk({ posting });
  } catch (err) {
    return jsonError(err);
  }
}
