// ---------------------------------------------------------------------------
// /api/generated-contents/[id]/post-assistant — manual posting package (GET)
//
// Returns everything the (manual) posting screen needs: content text, a public
// property summary, image THUMBNAILS, and the posting status. Originals are
// never signed here — clients request them explicitly via /image-urls.
//
// Authenticated + organization-scoped via the shared service; cross-org /
// unknown / archived ids resolve to NOT_FOUND. Never auto-posts.
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import { getPostAssistantPackage } from "@/lib/services/post-assistant";
import { jsonOk, jsonError } from "@/lib/api/responses";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();
    const pkg = await getPostAssistantPackage(ctx, id);
    return jsonOk(pkg);
  } catch (err) {
    return jsonError(err);
  }
}
