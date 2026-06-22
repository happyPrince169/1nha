// ---------------------------------------------------------------------------
// /api/generated-contents/[id]/post-assistant/image-urls — signed URLs (POST)
//
// Explicit, on-demand signed URLs for a selected subset of the content's
// property images. This is the ONLY way to obtain full-resolution originals
// (variant: "original") — the package endpoint returns thumbnails only.
//
// Body: { imageIds: string[], variant?: "thumbnail" | "original" }
// Authenticated + organization-scoped; ids outside the content's property → 404.
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import {
  getPostAssistantImageUrls,
  type GetImageUrlsInput,
} from "@/lib/services/post-assistant";
import { jsonOk, jsonError } from "@/lib/api/responses";
import { validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();

    let body: GetImageUrlsInput;
    try {
      body = (await request.json()) as GetImageUrlsInput;
    } catch {
      throw validationError("Body JSON không hợp lệ.");
    }

    const result = await getPostAssistantImageUrls(ctx, id, body);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
