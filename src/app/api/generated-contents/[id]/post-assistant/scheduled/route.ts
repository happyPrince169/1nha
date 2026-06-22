// ---------------------------------------------------------------------------
// /api/generated-contents/[id]/post-assistant/scheduled — mark scheduled (POST)
//
// Records the broker's intended posting time (manual workflow). Does NOT post.
// Body (optional): { scheduledAt?: string | null }  (ISO / datetime-local)
// Authenticated + organization-scoped; cross-org / unknown ids → NOT_FOUND.
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import {
  markContentScheduled,
  type MarkScheduledInput,
} from "@/lib/services/post-assistant";
import { jsonOk, jsonError } from "@/lib/api/responses";
import { validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();

    // Body is optional; tolerate an empty/missing body.
    let body: MarkScheduledInput = {};
    const text = await request.text();
    if (text.trim().length > 0) {
      try {
        body = JSON.parse(text) as MarkScheduledInput;
      } catch {
        throw validationError("Body JSON không hợp lệ.");
      }
    }

    const { posting } = await markContentScheduled(ctx, id, body);
    return jsonOk({ posting });
  } catch (err) {
    return jsonError(err);
  }
}
