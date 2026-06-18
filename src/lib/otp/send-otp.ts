// ---------------------------------------------------------------------------
// send-otp — provider-agnostic OTP delivery entry point (SERVER ONLY)
//
// Selects the configured provider (OTP_PROVIDER, default "esms") and delivers
// a Supabase-generated OTP. The app never creates or verifies OTPs. Add future
// providers (Stringee / VIHAT / Zalo) by registering them here.
// ---------------------------------------------------------------------------
import "server-only";

import { esmsProvider } from "./providers/esms";
import {
  OtpProviderConfigError,
  type OtpProvider,
  type OtpProviderName,
  type SendOtpInput,
  type SendOtpResult,
} from "./providers/types";

const PROVIDERS: Record<OtpProviderName, OtpProvider> = {
  esms: esmsProvider,
};

function selectedProviderName(): OtpProviderName {
  const raw = process.env.OTP_PROVIDER;
  if (raw && raw in PROVIDERS) return raw as OtpProviderName;
  // Default + only provider in Phase 3A.3.
  return "esms";
}

/**
 * Deliver an OTP through the active provider. Throws OtpProviderConfigError
 * when provider env is missing (caller maps that to a 5xx). Returns a result
 * with ok=false when the provider call itself fails (caller maps to 502).
 */
export async function sendOtp(input: SendOtpInput): Promise<SendOtpResult> {
  const provider = PROVIDERS[selectedProviderName()];
  return provider.send(input);
}

export { OtpProviderConfigError };
export type { SendOtpInput, SendOtpResult };
