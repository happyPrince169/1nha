"use client";

// ---------------------------------------------------------------------------
// LinkButton — a button-styled navigation link with immediate pending feedback.
//
// Drop-in replacement for `<Link className={cn(buttonVariants({...}), ...)}>`.
// While navigation to the link is in flight, it shows an inline spinner and
// blocks repeat taps — addressing the "nothing happens when I tap" perceived
// delay on primary CTAs that route to a server-rendered page.
//
// `buttonVariants` stays on the anchor itself, so layout/width/variant styling
// is byte-for-byte identical to the previous plain-Link usage.
// ---------------------------------------------------------------------------
import NextLink, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import type { VariantProps } from "class-variance-authority";

import { buttonVariants } from "./button";
import { cn } from "@/lib/utils";

// Rendered as a child of <Link> so useLinkStatus() can read the navigation
// state for its nearest parent link. Renders nothing until navigation starts.
function NavPendingSpinner() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      data-pending
      aria-hidden
      className="inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

type LinkButtonProps = ComponentProps<typeof NextLink> &
  VariantProps<typeof buttonVariants>;

export function LinkButton({
  className,
  variant,
  size,
  children,
  ...props
}: LinkButtonProps) {
  return (
    <NextLink
      data-slot="link-button"
      className={cn(
        buttonVariants({ variant, size }),
        // While the spinner child is present (navigation pending) dim the
        // button and block repeat taps. :has() is supported on all evergreen
        // mobile browsers this app targets.
        "has-[[data-pending]]:pointer-events-none has-[[data-pending]]:opacity-70",
        className
      )}
      {...props}
    >
      <NavPendingSpinner />
      {children}
    </NextLink>
  );
}
