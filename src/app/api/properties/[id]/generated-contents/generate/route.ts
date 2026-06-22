// ---------------------------------------------------------------------------
// /api/properties/[id]/generated-contents/generate — generate content (POST)
//
// Runs AI generation for a property the caller can access, persists the
// generated_contents row, and returns it. Authenticated + organization-scoped
// via the shared service; property + style-profile access are verified there.
//
// Body: { platform, content_type, voice? | tone? | styleProfileId? }
//   voice = the combined "Giọng văn" value ("tone:<id>" | "style:<id>"), or
//   pass tone / styleProfileId explicitly.
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import {
  generateContentForProperty,
  type GenerateContentInput,
} from "@/lib/services/generated-content";
import { jsonOk, jsonError } from "@/lib/api/responses";
import { validationError } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();

    let body: GenerateContentInput;
    try {
      body = (await request.json()) as GenerateContentInput;
    } catch {
      throw validationError("Body JSON không hợp lệ.");
    }

    const content = await generateContentForProperty(ctx, id, body);
    return jsonOk({ content }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
