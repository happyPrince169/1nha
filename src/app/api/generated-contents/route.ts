// ---------------------------------------------------------------------------
// /api/generated-contents — list generated contents (GET)
//
// Mobile-ready JSON API sharing the exact generated-content service +
// auth/workspace context as the web Server Actions. Authenticated +
// organization-scoped; standard { ok, data } / { ok, error } envelope.
// Supports ?platform=, ?status=, ?q=, ?limit=. No AI is called on reads.
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import { listGeneratedContents } from "@/lib/services/generated-content";
import { jsonOk, jsonError } from "@/lib/api/responses";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getRequestContext();
    const sp = request.nextUrl.searchParams;
    const limitRaw = sp.get("limit");
    const result = await listGeneratedContents(ctx, {
      platform: sp.get("platform"),
      status: sp.get("status"),
      q: sp.get("q"),
      limit: limitRaw ? Number(limitRaw) : undefined,
    });
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
