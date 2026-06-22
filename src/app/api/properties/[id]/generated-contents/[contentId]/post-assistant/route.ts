// ---------------------------------------------------------------------------
// /api/properties/[id]/generated-contents/[contentId]/post-assistant (GET)
//
// Property-scoped variant of the Post Assistant package — mirrors the web route
// /dashboard/properties/[id]/content/[contentId]/post. Verifies the content
// belongs to the property AND the caller's organization (cross-org / unknown /
// archived → NOT_FOUND). Returns thumbnails only; never auto-posts.
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import { getPostAssistantPackageForProperty } from "@/lib/services/post-assistant";
import { jsonOk, jsonError } from "@/lib/api/responses";

type RouteContext = { params: Promise<{ id: string; contentId: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id, contentId } = await params;
    const ctx = await getRequestContext();
    const pkg = await getPostAssistantPackageForProperty(ctx, id, contentId);
    return jsonOk(pkg);
  } catch (err) {
    return jsonError(err);
  }
}
