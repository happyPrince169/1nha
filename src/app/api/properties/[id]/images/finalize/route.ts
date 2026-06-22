// ---------------------------------------------------------------------------
// /api/properties/[id]/images/finalize — mark an upload ready (POST)
//
// Step 2 of the direct-to-R2 upload. Called after the client has PUT the
// bytes to R2 using the presigned URLs from /upload-targets. Marks the pending
// row ready so it becomes visible to reads.
//
// Body: { imageId }
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import {
  finalizePropertyImageUpload,
  type FinalizeUploadInput,
} from "@/lib/services/property-images";
import { jsonOk, jsonError } from "@/lib/api/responses";
import { validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();

    let body: FinalizeUploadInput;
    try {
      body = (await request.json()) as FinalizeUploadInput;
    } catch {
      throw validationError("Body JSON không hợp lệ.");
    }

    const result = await finalizePropertyImageUpload(ctx, id, body);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
