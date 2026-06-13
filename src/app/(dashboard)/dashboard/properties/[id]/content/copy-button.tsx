"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markContentCopied } from "./actions";

type Props = {
  text: string;
  contentId: string;
};

export function CopyButton({ text, contentId }: Props) {
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  async function handleCopy() {
    // Clipboard write
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers / HTTP contexts
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2500);

    // Fire-and-forget server action to record copied_at
    startTransition(async () => {
      await markContentCopied(contentId);
    });
  }

  return (
    <Button
      onClick={handleCopy}
      className="h-12 w-full text-base"
      variant={copied ? "secondary" : "default"}
    >
      {copied ? "✓ Đã sao chép!" : "Sao chép nội dung"}
    </Button>
  );
}
