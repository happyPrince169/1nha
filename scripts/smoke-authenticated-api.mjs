#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Phase 3D — Authenticated API smoke test
//
// Signs in with a TEST email/password via the Supabase anon client, obtains an
// access token, and calls the core mobile-ready API endpoints with
// `Authorization: Bearer <token>` to confirm the shared service layer behaves
// for an authenticated workspace user.
//
// SAFE BY DESIGN:
//   • Read-only by default. No OpenAI generation, no archive, no
//     regenerate, and no scheduled/posted mutations unless explicitly enabled.
//   • Never prints the access token.
//   • No hardcoded credentials — everything comes from env vars.
//   • Uses the public ANON key only. NEVER needs the service-role key.
//   • Runs against any base URL (local / preview / prod).
//
// Usage:
//   SMOKE_BASE_URL=http://localhost:3000 \
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
//   SMOKE_TEST_EMAIL=... SMOKE_TEST_PASSWORD=... \
//   node scripts/smoke-authenticated-api.mjs
//
// Required env:
//   SMOKE_BASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
//   SMOKE_TEST_EMAIL, SMOKE_TEST_PASSWORD
//
// Optional env (unlock deeper checks when provided):
//   SMOKE_PROPERTY_ID, SMOKE_CONTENT_ID, SMOKE_STYLE_PROFILE_ID, SMOKE_IMAGE_ID
//   SMOKE_FOREIGN_PROPERTY_ID, SMOKE_FOREIGN_CONTENT_ID   (expect 404)
//   SMOKE_RUN_MUTATIONS=1   (enables the low-risk "copied" mutation)
//   SMOKE_RUN_GENERATE=1    (enables one OpenAI generation — costs tokens)
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Env + tiny result tracker
// ---------------------------------------------------------------------------
const env = process.env;
const BASE_URL = (env.SMOKE_BASE_URL || "").replace(/\/$/, "");
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const EMAIL = env.SMOKE_TEST_EMAIL || "";
const PASSWORD = env.SMOKE_TEST_PASSWORD || "";

const RUN_MUTATIONS = env.SMOKE_RUN_MUTATIONS === "1";
const RUN_GENERATE = env.SMOKE_RUN_GENERATE === "1";

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  const tag = pass ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function requireEnv() {
  const missing = [];
  if (!BASE_URL) missing.push("SMOKE_BASE_URL");
  if (!SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_ANON_KEY) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!EMAIL) missing.push("SMOKE_TEST_EMAIL");
  if (!PASSWORD) missing.push("SMOKE_TEST_PASSWORD");
  if (missing.length > 0) {
    console.error(`Missing required env: ${missing.join(", ")}`);
    console.error("See docs/PHASE_3D_SMOKE_TESTS.md for setup.");
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers (token is captured in a closure; never logged)
// ---------------------------------------------------------------------------
function makeClient(token) {
  async function call(method, path, { auth = true, body } = {}) {
    const headers = { Accept: "application/json" };
    if (auth) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let res;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      return { status: 0, json: null, networkError: String(err) };
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  }
  return { call };
}

// expect 200 + { ok: true }
async function expectOk(client, name, method, path, opts) {
  const { status, json, networkError } = await client.call(method, path, opts);
  if (networkError) return record(name, false, `network error: ${networkError}`);
  const pass = status === 200 && json && json.ok === true;
  record(name, pass, `status=${status}${json && json.ok === false ? ` code=${json.error?.code}` : ""}`);
  return json;
}

// expect a specific status + { ok: false, error.code }
async function expectError(client, name, method, path, status, code, opts) {
  const r = await client.call(method, path, opts);
  if (r.networkError) return record(name, false, `network error: ${r.networkError}`);
  const codeOk = !code || r.json?.error?.code === code;
  const pass = r.status === status && r.json && r.json.ok === false && codeOk;
  record(name, pass, `status=${r.status}${r.json?.error?.code ? ` code=${r.json.error.code}` : ""}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  requireEnv();

  console.log(`\n1nha API smoke test → ${BASE_URL}`);
  console.log(`Mode: ${RUN_MUTATIONS ? "mutations ON" : "read-only"}${RUN_GENERATE ? " + generate ON" : ""}\n`);

  // --- Sign in (anon client; token never printed) -------------------------
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  const token = data?.session?.access_token;
  if (error || !token) {
    record("sign-in (email/password)", false, error?.message ?? "no access token");
    return summarize();
  }
  record("sign-in (email/password)", true, "access token acquired");
  const client = makeClient(token);

  // --- Unauthenticated guard (must stay 401) ------------------------------
  await expectError(client, "GET /api/properties (no auth) → 401", "GET", "/api/properties", 401, "UNAUTHORIZED", { auth: false });
  await expectError(client, "GET /api/generated-contents (no auth) → 401", "GET", "/api/generated-contents", 401, "UNAUTHORIZED", { auth: false });

  // --- Core authenticated reads -------------------------------------------
  await expectOk(client, "GET /api/properties", "GET", "/api/properties");
  await expectOk(client, "GET /api/style-profiles", "GET", "/api/style-profiles");
  await expectOk(client, "GET /api/generated-contents", "GET", "/api/generated-contents");

  // --- Property-scoped reads (optional) -----------------------------------
  const propertyId = env.SMOKE_PROPERTY_ID;
  if (propertyId) {
    await expectOk(client, "GET /api/properties/:id", "GET", `/api/properties/${propertyId}`);
    await expectOk(client, "GET /api/properties/:id/images", "GET", `/api/properties/${propertyId}/images`);
    await expectOk(client, "GET /api/properties/:id/generated-contents", "GET", `/api/properties/${propertyId}/generated-contents`);
  } else {
    console.log("  [skip] property-scoped reads (set SMOKE_PROPERTY_ID)");
  }

  // --- Content-scoped reads (optional) ------------------------------------
  const contentId = env.SMOKE_CONTENT_ID;
  if (contentId) {
    await expectOk(client, "GET /api/generated-contents/:id", "GET", `/api/generated-contents/${contentId}`);
    await expectOk(client, "GET /api/generated-contents/:id/post-assistant", "GET", `/api/generated-contents/${contentId}/post-assistant`);
  } else {
    console.log("  [skip] content-scoped reads (set SMOKE_CONTENT_ID)");
  }

  // --- Style profile (optional) -------------------------------------------
  if (env.SMOKE_STYLE_PROFILE_ID) {
    await expectOk(client, "GET /api/style-profiles/:id", "GET", `/api/style-profiles/${env.SMOKE_STYLE_PROFILE_ID}`);
  }

  // --- Image URLs (explicit on-demand; thumbnails then originals) ---------
  if (contentId && env.SMOKE_IMAGE_ID) {
    const imageIds = [env.SMOKE_IMAGE_ID];
    await expectOk(client, "POST post-assistant/image-urls (thumbnail)", "POST", `/api/generated-contents/${contentId}/post-assistant/image-urls`, { body: { imageIds, variant: "thumbnail" } });
    await expectOk(client, "POST post-assistant/image-urls (original)", "POST", `/api/generated-contents/${contentId}/post-assistant/image-urls`, { body: { imageIds, variant: "original" } });
  } else {
    console.log("  [skip] image-urls (set SMOKE_CONTENT_ID + SMOKE_IMAGE_ID)");
  }

  // --- Cross-org isolation (optional; must be 404) ------------------------
  if (env.SMOKE_FOREIGN_PROPERTY_ID) {
    await expectError(client, "GET /api/properties/:foreign → 404", "GET", `/api/properties/${env.SMOKE_FOREIGN_PROPERTY_ID}`, 404, "NOT_FOUND");
  }
  if (env.SMOKE_FOREIGN_CONTENT_ID) {
    await expectError(client, "GET /api/generated-contents/:foreign → 404", "GET", `/api/generated-contents/${env.SMOKE_FOREIGN_CONTENT_ID}`, 404, "NOT_FOUND");
  }

  // --- Low-risk mutation: mark copied (opt-in) ----------------------------
  if (RUN_MUTATIONS && contentId) {
    await expectOk(client, "POST post-assistant/copied", "POST", `/api/generated-contents/${contentId}/post-assistant/copied`);
  } else if (!RUN_MUTATIONS) {
    console.log("  [skip] mark copied (set SMOKE_RUN_MUTATIONS=1)");
  }

  // --- Generation (opt-in; COSTS OpenAI tokens) ---------------------------
  if (RUN_GENERATE && propertyId) {
    await expectOk(client, "POST property generate (OpenAI)", "POST", `/api/properties/${propertyId}/generated-contents/generate`, {
      body: { platform: "facebook", content_type: "sales_post", voice: "tone:professional" },
    });
  } else if (!RUN_GENERATE) {
    console.log("  [skip] generate (set SMOKE_RUN_GENERATE=1 — costs OpenAI tokens)");
  }

  return summarize();
}

function summarize() {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = total - passed;
  console.log(`\n──────────────────────────────────────────────`);
  console.log(`Smoke summary: ${passed}/${total} passed, ${failed} failed`);
  console.log(`──────────────────────────────────────────────\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Smoke run crashed:", err?.message ?? err);
  process.exit(1);
});
