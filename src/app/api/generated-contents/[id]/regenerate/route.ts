// ---------------------------------------------------------------------------
// /api/generated-contents/[id]/regenerate — produce a new variation (POST)
//
// Re-runs AI generation reusing the source content's platform / content type /
// voice unless overridden in the body. Persists a NEW row linked via
// parent_content_id. Authenticated + organization-scoped via the shared service.
//
// Optional body: { platform?, content_type?, voice?, tone?, styleProfileId? }
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import {
  regenerateGeneratedContent,
  type GenerateContentInput,
} from "@/lib/services/generated-content";
import { jsonOk, jsonError } from "@/lib/api/responses";
import { validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();

    // Body is optional for regenerate; tolerate an empty/missing body.
    let body: GenerateContentInput = {};
    const text = await request.text();
    if (text.trim().length > 0) {
      try {
        body = JSON.parse(text) as GenerateContentInput;
      } catch {
        throw validationError("Body JSON không hợp lệ.");
      }
    }

    const content = await regenerateGeneratedContent(ctx, id, body);
    return jsonOk({ content }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
