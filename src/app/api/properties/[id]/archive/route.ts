// ---------------------------------------------------------------------------
// /api/properties/[id]/archive — archive (POST)
//
// Sets status = 'archived' (never deletes). Authenticated + organization-scoped
// via the shared service; cross-org returns NOT_FOUND.
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import { archiveProperty } from "@/lib/services/properties";
import { jsonOk, jsonError } from "@/lib/api/responses";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();
    await archiveProperty(ctx, id);
    return jsonOk({ id, status: "archived" });
  } catch (err) {
    return jsonError(err);
  }
}
