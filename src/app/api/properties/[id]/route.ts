// ---------------------------------------------------------------------------
// /api/properties/[id] — fetch single (GET) + update (PATCH)
//
// Authenticated + organization-scoped via the shared service. Cross-org access
// returns NOT_FOUND (never leaks another workspace's data).
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import {
  getPropertyById,
  updateProperty,
  type PropertyWriteInput,
} from "@/lib/services/properties";
import { jsonOk, jsonError } from "@/lib/api/responses";
import { validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();
    const property = await getPropertyById(ctx, id);
    return jsonOk(property);
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();

    let body: PropertyWriteInput;
    try {
      body = (await request.json()) as PropertyWriteInput;
    } catch {
      throw validationError("Body JSON không hợp lệ.");
    }

    await updateProperty(ctx, id, body);
    return jsonOk({ id });
  } catch (err) {
    return jsonError(err);
  }
}
