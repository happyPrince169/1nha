// ---------------------------------------------------------------------------
// /api/style-profiles/[id]/default — set as the organization's default (POST)
//
// Clears the previous org default, then sets this profile as default.
// Authenticated + organization-scoped via the shared service.
// ---------------------------------------------------------------------------
import type { NextRequest } from "next/server";

import { getRequestContext } from "@/lib/workspace/request-context";
import { setDefaultStyleProfile } from "@/lib/services/style-profiles";
import { jsonOk, jsonError } from "@/lib/api/responses";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await getRequestContext();
    const profile = await setDefaultStyleProfile(ctx, id);
    return jsonOk({ profile, defaultProfileId: profile.id });
  } catch (err) {
    return jsonError(err);
  }
}
