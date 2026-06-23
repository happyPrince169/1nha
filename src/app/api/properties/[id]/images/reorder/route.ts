// ---------------------------------------------------------------------------
// /api/properties/[id]/images/reorder — persist a new image order (POST)
//
// Writes sort_order = index for the provided image ids. Every id is verified to
// belong to the property + organization in the service, so a foreign/cross-org
// id resolves to NOT_FOUND. No image bytes move here.
//
// Body: { orderedImageIds: string[] }
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import { reorderPropertyImages } from "@/lib/services/property-images";
import { jsonOk, jsonError } from "@/lib/api/responses";
import { validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();

    let body: { orderedImageIds?: unknown };
    try {
      body = (await request.json()) as { orderedImageIds?: unknown };
    } catch {
      throw validationError("Body JSON không hợp lệ.");
    }

    const orderedImageIds = body?.orderedImageIds;
    if (
      !Array.isArray(orderedImageIds) ||
      !orderedImageIds.every((v) => typeof v === "string")
    ) {
      throw validationError("Danh sách ảnh không hợp lệ.");
    }

    const result = await reorderPropertyImages(ctx, id, orderedImageIds);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
