"use client";

// ---------------------------------------------------------------------------
// PhoneSignInForm — primary login UX: Vietnamese phone + SMS OTP.
//
// Two steps driven by the send action's result:
//   1. Enter phone  → "Gửi mã OTP"  (sendPhoneOtp)
//   2. Enter OTP     → "Xác nhận"    (verifyPhoneOtp) + đổi số / gửi lại mã
// Email/password remains available as a fallback on the same page.
// ---------------------------------------------------------------------------
import { useActionState, useEffect, useState } from "react";

import {
  sendPhoneOtp,
  verifyPhoneOtp,
  type PhoneOtpState,
} from "../actions";
import { authInputClass } from "../auth-styles";
import { maskVietnamesePhone } from "@/lib/auth/phone";
import { Button } from "@/components/ui/button";

const SEND_INIT: PhoneOtpState = { error: null, phone: null };
const VERIFY_INIT: PhoneOtpState = { error: null, phone: null };
const RESEND_COOLDOWN_SECONDS = 30;

export function PhoneSignInForm() {
  const [sendState, sendAction, sending] = useActionState(
    sendPhoneOtp,
    SEND_INIT
  );
  const [verifyState, verifyAction, verifying] = useActionState(
    verifyPhoneOtp,
    VERIFY_INIT
  );

  const [phone, setPhone] = useState("");
  // Set true only by "Đổi số điện thoại" to return to the phone step after an
  // OTP was already sent. Reset on (re)send via the submit handler.
  const [editingPhone, setEditingPhone] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Countdown ticks via an async timeout callback (not a synchronous effect
  // setState), so each (re)send refreshes the resend cooldown.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Event-driven step/cooldown bookkeeping — runs on the actual submit.
  function handleSendSubmit() {
    setEditingPhone(false);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  const showOtpStep = !editingPhone && !!sendState.otpSent && !!sendState.phone;

  // ----- Step 1: enter phone -----------------------------------------------
  if (!showOtpStep) {
    return (
      <form
        action={sendAction}
        onSubmit={handleSendSubmit}
        className="flex flex-col gap-3"
      >
        {sendState.error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {sendState.error}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-sm font-medium leading-none">
            Số điện thoại
          </label>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-11 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
              +84
            </span>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              placeholder="0936 389 336"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={authInputClass}
              disabled={sending}
            />
          </div>
        </div>

        <Button type="submit" className="h-11 w-full" disabled={sending}>
          {sending ? "Đang gửi mã…" : "Gửi mã OTP"}
        </Button>
      </form>
    );
  }

  // ----- Step 2: enter OTP --------------------------------------------------
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Mã đã gửi đến{" "}
        <span className="font-medium text-foreground">
          {maskVietnamesePhone(sendState.phone!)}
        </span>
      </p>

      <form action={verifyAction} className="flex flex-col gap-3">
        {verifyState.error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {verifyState.error}
          </p>
        )}

        <input type="hidden" name="phone" value={sendState.phone ?? ""} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="token" className="text-sm font-medium leading-none">
            Mã xác thực
          </label>
          <input
            id="token"
            name="token"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={6}
            pattern="\d{6}"
            placeholder="••••••"
            className={authInputClass}
            disabled={verifying}
          />
        </div>

        <Button type="submit" className="h-11 w-full" disabled={verifying}>
          {verifying ? "Đang xác nhận…" : "Xác nhận"}
        </Button>
      </form>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setEditingPhone(true)}
          className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Đổi số điện thoại
        </button>

        {/* Resend re-runs the send action with the same (normalized) number. */}
        <form action={sendAction} onSubmit={handleSendSubmit}>
          <input type="hidden" name="phone" value={sendState.phone ?? ""} />
          <button
            type="submit"
            disabled={sending || cooldown > 0}
            className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50 disabled:no-underline"
          >
            {cooldown > 0 ? `Gửi lại mã (${cooldown}s)` : "Gửi lại mã"}
          </button>
        </form>
      </div>
    </div>
  );
}
