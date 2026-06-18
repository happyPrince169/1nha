// ---------------------------------------------------------------------------
// /api/properties — list (GET) + create (POST)
//
// Mobile-ready JSON API for the Properties workflow. Shares the exact same
// service layer + auth/workspace context as the web Server Actions, so web and
// the future Expo app behave identically. Authenticated + organization-scoped;
// standard { ok, data } / { ok, error } envelope; paginated by default.
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import {
  listProperties,
  createProperty,
  parsePropertyListParams,
  type PropertyWriteInput,
} from "@/lib/services/properties";
import { jsonOk, jsonError } from "@/lib/api/responses";
import { validationError } from "@/lib/api/errors";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getRequestContext();
    const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
    const params = parsePropertyListParams(raw);
    const result = await listProperties(ctx, params);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getRequestContext();

    let body: PropertyWriteInput;
    try {
      body = (await request.json()) as PropertyWriteInput;
    } catch {
      throw validationError("Body JSON không hợp lệ.");
    }

    const { id } = await createProperty(ctx, body);
    return jsonOk({ id }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
