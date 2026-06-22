// ---------------------------------------------------------------------------
// /api/properties/[id]/images — list property images (GET)
//
// Mobile-ready JSON API sharing the exact property-images service + auth /
// workspace context as the web Server Actions. Authenticated +
// organization-scoped (through the parent property); standard { ok, data } /
// { ok, error } envelope. Cross-org / unknown ids resolve to NOT_FOUND.
//
// By default returns THUMBNAIL signed URLs (fast list/gallery surface). Pass
// ?variant=original only when full-resolution URLs are actually needed — the
// default never ships originals.
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import {
  listPropertyImages,
  type ImageUrlVariant,
} from "@/lib/services/property-images";
import { jsonOk, jsonError } from "@/lib/api/responses";

type RouteContext = { params: Promise<{ id: string }> };

function parseVariant(raw: string | null): ImageUrlVariant {
  return raw === "original" ? "original" : "thumbnail";
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();
    const variant = parseVariant(request.nextUrl.searchParams.get("variant"));
    const images = await listPropertyImages(ctx, id, { variant });
    return jsonOk({ images });
  } catch (err) {
    return jsonError(err);
  }
}
