import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// OnboardingChecklist
//
// Shown on the dashboard when the user has 0 active properties.
// Gives new users a clear three-step path to their first win.
// ---------------------------------------------------------------------------
const STEPS = [
  {
    number: 1,
    label: "Nhập căn đầu tiên",
    description: "Dán tin nhắn hoặc tải ảnh — AI tự điền form cho bạn.",
    href: "/dashboard/properties/quick-add",
    cta: "Nhập nhanh bằng AI →",
  },
  {
    number: 2,
    label: "Tạo content AI",
    description: "Chọn nền tảng, giọng văn — 1nha viết bài đăng sẵn sàng copy.",
    href: null,
    cta: null,
  },
  {
    number: 3,
    label: "Copy và đăng thử",
    description: "Sao chép nội dung, đăng lên Facebook, Zalo hoặc TikTok.",
    href: null,
    cta: null,
  },
] as const;

export function OnboardingChecklist() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">🚀 Bắt đầu trong 3 bước</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-0 divide-y divide-border">
        {STEPS.map((step) => (
          <div key={step.number} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            {/* Step number circle */}
            <div
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                step.number === 1
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground"
              )}
              aria-hidden
            >
              {step.number}
            </div>

            {/* Text + optional CTA */}
            <div className="flex flex-1 flex-col gap-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  step.number !== 1 && "text-muted-foreground"
                )}
              >
                {step.label}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {step.description}
              </p>
              {step.href && step.cta && (
                <Link
                  href={step.href}
                  className={cn(
                    buttonVariants({ size: "sm" }),
                    "mt-2 self-start"
                  )}
                >
                  {step.cta}
                </Link>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
