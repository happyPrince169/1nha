// ---------------------------------------------------------------------------
// eSMS provider adapter (SERVER ONLY)  — https://esms.vn
//
// Delivers a Supabase-generated OTP via eSMS, supporting two modes:
//   • sms_only : eSMS Brandname SMS (V4 JSON endpoint)
//   • zns_sms  : try Zalo ZNS first, fall back to Brandname SMS
//
// ⚠️ VERIFY BEFORE PRODUCTION: the exact eSMS endpoint paths, field names,
// `SmsType`, and the ZNS `TempData` param key depend on your eSMS account /
// approved templates and the current eSMS API version. They are isolated in
// the small builder functions below so corrections are a one-line change.
// Confirm against the eSMS dashboard/API docs before going live.
//
// Secrets come from server-only env (never NEXT_PUBLIC_*). OTPs are never
// logged.
// ---------------------------------------------------------------------------
import "server-only";

import {
  buildOtpMessage,
  OtpProviderConfigError,
  type OtpProvider,
  type SendOtpInput,
  type SendOtpResult,
} from "./types";

const ESMS_BASE = "https://rest.esms.vn/MainService.svc/json";
const ESMS_SUCCESS_CODE = "100";

type EsmsMode = "sms_only" | "zns_sms";

type EsmsConfig = {
  apiKey: string;
  secretKey: string;
  brandname: string | null;
  oaId: string | null;
  znsTempId: string | null;
  mode: EsmsMode;
  sandbox: boolean;
};

function readMode(): EsmsMode {
  return process.env.ESMS_MODE === "zns_sms" ? "zns_sms" : "sms_only";
}

/** Read + validate eSMS env for the active mode. Throws (no secrets leaked). */
function readEsmsConfig(): EsmsConfig {
  const apiKey = process.env.ESMS_API_KEY;
  const secretKey = process.env.ESMS_SECRET_KEY;
  const brandname = process.env.ESMS_BRANDNAME ?? null;
  const oaId = process.env.ESMS_OA_ID ?? null;
  const znsTempId = process.env.ESMS_ZNS_TEMP_ID ?? null;
  const mode = readMode();

  const missing: string[] = [];
  if (!apiKey) missing.push("ESMS_API_KEY");
  if (!secretKey) missing.push("ESMS_SECRET_KEY");
  // SMS (and the zns_sms SMS fallback) needs a brandname.
  if (!brandname) missing.push("ESMS_BRANDNAME");
  if (mode === "zns_sms") {
    if (!oaId) missing.push("ESMS_OA_ID");
    if (!znsTempId) missing.push("ESMS_ZNS_TEMP_ID");
  }

  if (missing.length > 0) {
    throw new OtpProviderConfigError(
      `Thiếu cấu hình eSMS: ${missing.join(", ")} (đặt trong biến môi trường server-only).`
    );
  }

  return {
    apiKey: apiKey!,
    secretKey: secretKey!,
    brandname,
    oaId,
    znsTempId,
    mode,
    sandbox: process.env.ESMS_SANDBOX === "1",
  };
}

type EsmsResponse = {
  CodeResult?: string;
  SMSID?: string;
  MsgId?: string;
  ErrorMessage?: string;
};

async function postJson(path: string, body: unknown): Promise<EsmsResponse> {
  const res = await fetch(`${ESMS_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // No caching for transactional sends.
    cache: "no-store",
  });
  // eSMS returns 200 with a JSON body carrying CodeResult even on logical
  // failures; a non-2xx is a transport/provider outage.
  if (!res.ok) {
    return { CodeResult: `HTTP_${res.status}` };
  }
  try {
    return (await res.json()) as EsmsResponse;
  } catch {
    return { CodeResult: "PARSE_ERROR" };
  }
}

function resultFrom(res: EsmsResponse): SendOtpResult {
  const ok = res.CodeResult === ESMS_SUCCESS_CODE;
  return {
    provider: "esms",
    ok,
    providerMessageId: res.SMSID ?? res.MsgId,
    rawCode: res.CodeResult,
    error: ok ? undefined : `eSMS CodeResult=${res.CodeResult ?? "unknown"}`,
  };
}

// --- Endpoint builders (the parts most likely to need eSMS-doc tweaks) ------

/** Brandname SMS via SendMultipleMessage_V4. SmsType "2" = CSKH/brandname. */
async function sendViaSms(
  cfg: EsmsConfig,
  input: SendOtpInput
): Promise<EsmsResponse> {
  return postJson("SendMultipleMessage_V4_post_json/", {
    ApiKey: cfg.apiKey,
    SecretKey: cfg.secretKey,
    Brandname: cfg.brandname,
    Phone: input.phone,
    Content: buildOtpMessage(input.otp),
    SmsType: "2",
    IsUnicode: "0", // non-unicode → 1 segment, avoids diacritic encoding issues
    Sandbox: cfg.sandbox ? "1" : "0",
    RequestId: input.requestId,
  });
}

/** Zalo ZNS via SendZaloMessage_V4. TempData keys must match the approved
 *  template (default param key "otp" — adjust to your template if different). */
async function sendViaZns(
  cfg: EsmsConfig,
  input: SendOtpInput
): Promise<EsmsResponse> {
  return postJson("SendZaloMessage_V4_post_json/", {
    ApiKey: cfg.apiKey,
    SecretKey: cfg.secretKey,
    OAID: cfg.oaId,
    TempID: cfg.znsTempId,
    Phone: input.phone,
    TempData: { otp: input.otp },
    Sandbox: cfg.sandbox ? "1" : "0",
    RequestId: input.requestId,
  });
}

function devTrace(input: SendOtpInput, cfg: EsmsConfig, stage: string): void {
  if (process.env.NODE_ENV === "production") return;
  // Dev-only: confirm a send was requested. NEVER log the OTP.
  console.log(
    `[otp:esms] send requested — mode=${cfg.mode} sandbox=${cfg.sandbox} ` +
      `phone=${input.phone.replace(/\d(?=\d{3})/g, "•")} stage=${stage}`
  );
}

export const esmsProvider: OtpProvider = {
  name: "esms",
  async send(input: SendOtpInput): Promise<SendOtpResult> {
    const cfg = readEsmsConfig();
    devTrace(input, cfg, "start");

    if (cfg.mode === "zns_sms") {
      // Prefer ZNS (cheaper/branded); fall back to SMS on any ZNS failure.
      const znsResult = resultFrom(await sendViaZns(cfg, input));
      if (znsResult.ok) return znsResult;
      devTrace(input, cfg, "zns-fallback-to-sms");
      const smsResult = resultFrom(await sendViaSms(cfg, input));
      // Surface the ZNS code too so failures are debuggable.
      return smsResult.ok
        ? smsResult
        : { ...smsResult, error: `zns:${znsResult.rawCode} sms:${smsResult.rawCode}` };
    }

    return resultFrom(await sendViaSms(cfg, input));
  },
};
