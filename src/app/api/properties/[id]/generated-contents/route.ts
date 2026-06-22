// ---------------------------------------------------------------------------
// /api/properties/[id]/generated-contents — list a property's contents (GET)
//
// Authenticated + organization-scoped via the shared service (property access
// is verified through the Properties service). Supports ?status=, ?limit=.
// No AI is called on reads.
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import { listPropertyGeneratedContents } from "@/lib/services/generated-content";
import { jsonOk, jsonError } from "@/lib/api/responses";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();
    const sp = request.nextUrl.searchParams;
    const limitRaw = sp.get("limit");
    const result = await listPropertyGeneratedContents(ctx, id, {
      status: sp.get("status"),
      limit: limitRaw ? Number(limitRaw) : undefined,
    });
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
