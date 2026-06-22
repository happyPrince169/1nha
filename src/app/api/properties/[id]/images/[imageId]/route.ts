// ---------------------------------------------------------------------------
// /api/properties/[id]/images/[imageId] — update meta (PATCH) + delete (DELETE)
//
// Authenticated + organization-scoped (through the parent property) via the
// shared service. Cross-org / unknown ids resolve to NOT_FOUND.
//
// PATCH body: { caption?, alt_text? } — at least one editable field.
// DELETE removes the stored object(s) and the metadata row.
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import {
  updatePropertyImage,
  deletePropertyImage,
  type UpdatePropertyImageInput,
} from "@/lib/services/property-images";
import { jsonOk, jsonError } from "@/lib/api/responses";
import { validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string; imageId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id, imageId } = await params;
    const ctx = await getRequestContext();

    let body: UpdatePropertyImageInput;
    try {
      body = (await request.json()) as UpdatePropertyImageInput;
    } catch {
      throw validationError("Body JSON không hợp lệ.");
    }

    const result = await updatePropertyImage(ctx, id, imageId, body);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id, imageId } = await params;
    const ctx = await getRequestContext();
    const result = await deletePropertyImage(ctx, id, imageId);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
