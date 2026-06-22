// ---------------------------------------------------------------------------
// /api/properties/[id]/images/upload-targets — request R2 presigned PUT URLs (POST)
//
// Step 1 of the direct-to-R2 upload. The client has already processed the photo
// into a social-ready main image + small thumbnail; this returns presigned PUT
// URLs for both. The client PUTs the bytes straight to R2, then calls
// /finalize. Bytes never pass through the server.
//
// Body: { fileName, width, height, original:{mimeType,sizeBytes},
//         thumbnail:{mimeType,sizeBytes} }
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import {
  requestPropertyImageUploadTargets,
  type RequestUploadTargetsInput,
} from "@/lib/services/property-images";
import { jsonOk, jsonError } from "@/lib/api/responses";
import { validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();

    let body: RequestUploadTargetsInput;
    try {
      body = (await request.json()) as RequestUploadTargetsInput;
    } catch {
      throw validationError("Body JSON không hợp lệ.");
    }

    const targets = await requestPropertyImageUploadTargets(ctx, id, body);
    return jsonOk(targets, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
