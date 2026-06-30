#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Phase 4E-light — Team permission smoke test (Bearer API)
//
// Verifies the Phase 4C (service) + Phase 4D (RLS) permission boundary holds
// over the JSON API a future Expo mobile client will use. It signs a MEMBER
// (and, optionally, an OWNER) in via the Supabase anon client, grabs an access
// token, and calls /api/* with `Authorization: Bearer <token>`.
//
// SAFE BY DESIGN:
//   • Read-only by default. The only mutating probes EXPECT 403 (a correct
//     backend checks permission BEFORE any DB write, so nothing is mutated).
//   • The property-archive forbidden probe is additionally gated behind
//     SMOKE_ALLOW_ARCHIVE_PROBE=1 (it would archive only if the backend were
//     BROKEN and wrongly returned 200 — that is the bug we are hunting).
//   • Never prints the access token.
//   • No hardcoded credentials — everything comes from env vars.
//   • Uses the public ANON key only. NEVER needs the service-role key.
//
// Usage:
//   SMOKE_BASE_URL=http://localhost:3000 \
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
//   SMOKE_MEMBER_EMAIL=... SMOKE_MEMBER_PASSWORD=... \
//   node scripts/smoke-team-permissions.mjs
//
// Required env:
//   SMOKE_BASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
//   SMOKE_MEMBER_EMAIL, SMOKE_MEMBER_PASSWORD
//     (the MEMBER must be a non-owner/non-admin member of a shared workspace)
//
// Optional env (unlock deeper checks when provided):
//   SMOKE_OWNER_EMAIL, SMOKE_OWNER_PASSWORD   (owner of the same workspace)
//   SMOKE_UNRELATED_CONTENT_ID                (SAME-org content the member does
//                                              NOT manage → expect 403)
//   SMOKE_UNRELATED_PROPERTY_ID               (SAME-org property the member does
//                                              NOT manage → expect 403)
//   SMOKE_ALLOW_ARCHIVE_PROBE=1               (run the property-archive 403 probe)
//
// NOTE on "unrelated" ids: they must be in the MEMBER's OWN workspace but owned
// by someone else (created_by / assigned_to ≠ the member). An id from ANOTHER
// org returns 404 (NOT_FOUND), which tests cross-org isolation, not the team
// permission boundary.
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Env + tiny result tracker
// ---------------------------------------------------------------------------
const env = process.env;
const BASE_URL = (env.SMOKE_BASE_URL || "").replace(/\/$/, "");
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const MEMBER_EMAIL = env.SMOKE_MEMBER_EMAIL || "";
const MEMBER_PASSWORD = env.SMOKE_MEMBER_PASSWORD || "";
const OWNER_EMAIL = env.SMOKE_OWNER_EMAIL || "";
const OWNER_PASSWORD = env.SMOKE_OWNER_PASSWORD || "";

const ALLOW_ARCHIVE_PROBE = env.SMOKE_ALLOW_ARCHIVE_PROBE === "1";

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
  if (!MEMBER_EMAIL) missing.push("SMOKE_MEMBER_EMAIL");
  if (!MEMBER_PASSWORD) missing.push("SMOKE_MEMBER_PASSWORD");
  if (missing.length > 0) {
    console.error(`Missing required env: ${missing.join(", ")}`);
    console.error("See docs/PHASE_4E_LIGHT_BACKEND_SANITY.md for setup.");
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

// Sign in via the anon client and return a Bearer client (token never printed).
async function signIn(label, email, password) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  const token = data?.session?.access_token;
  if (error || !token) {
    record(`sign-in (${label})`, false, error?.message ?? "no access token");
    return null;
  }
  record(`sign-in (${label})`, true, "access token acquired");
  return makeClient(token);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  requireEnv();

  console.log(`\n1nha team-permission smoke test → ${BASE_URL}`);
  console.log(
    `Probes: archive-403 ${ALLOW_ARCHIVE_PROBE ? "ON" : "OFF (set SMOKE_ALLOW_ARCHIVE_PROBE=1)"}\n`
  );

  // --- MEMBER session -----------------------------------------------------
  const member = await signIn("member", MEMBER_EMAIL, MEMBER_PASSWORD);
  if (!member) return summarize();

  // Unauthenticated guard (must stay 401, no cookie fallback for Bearer clients).
  await expectError(member, "GET /api/properties (no auth) → 401", "GET", "/api/properties", 401, "UNAUTHORIZED", { auth: false });
  await expectError(member, "GET /api/generated-contents (no auth) → 401", "GET", "/api/generated-contents", 401, "UNAUTHORIZED", { auth: false });

  // Member can READ the shared workspace inventory (visibility is org-wide).
  await expectOk(member, "member GET /api/properties (read list)", "GET", "/api/properties");
  await expectOk(member, "member GET /api/style-profiles", "GET", "/api/style-profiles");
  await expectOk(member, "member GET /api/generated-contents", "GET", "/api/generated-contents");

  // Member is FORBIDDEN from mutating an asset on a property they don't manage.
  // Primary (safe) probe: marking content copied checks the parent property's
  // manage permission BEFORE writing, so a correct backend returns 403 and only
  // sets a copied_at timestamp even if it (wrongly) succeeded.
  if (env.SMOKE_UNRELATED_CONTENT_ID) {
    await expectError(
      member,
      "member POST post-assistant/copied on unrelated content → 403",
      "POST",
      `/api/generated-contents/${env.SMOKE_UNRELATED_CONTENT_ID}/post-assistant/copied`,
      403,
      "FORBIDDEN"
    );
  } else {
    console.log("  [skip] unrelated-content 403 probe (set SMOKE_UNRELATED_CONTENT_ID)");
  }

  // Stronger probe (opt-in): archiving an unrelated property. archiveProperty
  // checks manage permission BEFORE the status write, so a correct backend never
  // mutates here. Gated behind SMOKE_ALLOW_ARCHIVE_PROBE because a BROKEN backend
  // returning 200 would actually archive the property (reversible via "archived"
  // filter, but a real side effect).
  if (env.SMOKE_UNRELATED_PROPERTY_ID) {
    if (ALLOW_ARCHIVE_PROBE) {
      await expectError(
        member,
        "member POST /api/properties/:unrelated/archive → 403",
        "POST",
        `/api/properties/${env.SMOKE_UNRELATED_PROPERTY_ID}/archive`,
        403,
        "FORBIDDEN"
      );
    } else {
      console.log("  [skip] unrelated-property archive 403 probe (set SMOKE_ALLOW_ARCHIVE_PROBE=1)");
    }
  } else {
    console.log("  [skip] unrelated-property archive 403 probe (set SMOKE_UNRELATED_PROPERTY_ID)");
  }

  // --- OWNER session (optional) -------------------------------------------
  if (OWNER_EMAIL && OWNER_PASSWORD) {
    const owner = await signIn("owner", OWNER_EMAIL, OWNER_PASSWORD);
    if (owner) {
      await expectOk(owner, "owner GET /api/properties", "GET", "/api/properties");
      await expectOk(owner, "owner GET /api/style-profiles", "GET", "/api/style-profiles");
      await expectOk(owner, "owner GET /api/generated-contents", "GET", "/api/generated-contents");
    }
  } else {
    console.log("  [skip] owner basics (set SMOKE_OWNER_EMAIL + SMOKE_OWNER_PASSWORD)");
  }

  return summarize();
}

function summarize() {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = total - passed;
  console.log(`\n──────────────────────────────────────────────`);
  console.log(`Team-permission smoke: ${passed}/${total} passed, ${failed} failed`);
  console.log(`──────────────────────────────────────────────\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Smoke run crashed:", err?.message ?? err);
  process.exit(1);
});
