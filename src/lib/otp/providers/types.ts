// ---------------------------------------------------------------------------
// OTP provider abstraction (SERVER ONLY)
//
// The app NEVER generates or verifies OTPs — Supabase Auth owns that lifecycle.
// A provider here only *delivers* an OTP string that Supabase already produced
// (received via the Send SMS Hook). Keeping a thin interface lets us add
// Stringee / VIHAT / Zalo (ZNS) alternatives later without touching the route.
// ---------------------------------------------------------------------------

export type OtpProviderName = "esms";

export type SendOtpInput = {
  /** E.164 phone, e.g. "+84901234567". */
  phone: string;
  /** The OTP code Supabase generated. Treat as a secret: never log it. */
  otp: string;
  /** Supabase user id, when present in the hook payload. */
  userId?: string;
  /** Correlation id for tracing a single send (never includes the OTP). */
  requestId?: string;
};

export type SendOtpResult = {
  provider: OtpProviderName;
  ok: boolean;
  /** Provider-side message/transaction id, when returned (safe to log). */
  providerMessageId?: string;
  /** Provider's raw status/result code, for debugging (never the OTP). */
  rawCode?: string;
  /** Server-side error detail when ok=false (safe: no secrets/OTP). */
  error?: string;
};

export interface OtpProvider {
  readonly name: OtpProviderName;
  send(input: SendOtpInput): Promise<SendOtpResult>;
}

/** Thrown when provider env configuration is missing/invalid (setup bug). */
export class OtpProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtpProviderConfigError";
  }
}

/** Default non-unicode OTP message (GSM-7 safe → 1 SMS segment, no diacritics). */
export function buildOtpMessage(otp: string): string {
  return `Ma xac thuc 1nha cua ban la ${otp}. Ma co hieu luc trong 5 phut.`;
}
