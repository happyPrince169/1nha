// ---------------------------------------------------------------------------
// /api/properties/[id]/images/[imageId]/cover — set as cover image (POST)
//
// Clears is_cover across the property, then sets it on this image.
// Authenticated + organization-scoped (through the parent property).
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import { setPropertyCoverImage } from "@/lib/services/property-images";
import { jsonOk, jsonError } from "@/lib/api/responses";

type RouteContext = { params: Promise<{ id: string; imageId: string }> };

export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id, imageId } = await params;
    const ctx = await getRequestContext();
    const result = await setPropertyCoverImage(ctx, id, imageId);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
