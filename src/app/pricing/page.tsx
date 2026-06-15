import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Bảng giá dự kiến — 1nha",
};

// ---------------------------------------------------------------------------
// Plan data
// ---------------------------------------------------------------------------
type PlanFeature = string;

type Plan = {
  name: string;
  price: string;
  priceNote: string | null;
  description: string;
  features: readonly PlanFeature[];
  ctaLabel: string;
  ctaHref: string;
  highlighted: boolean;
};

const PLANS: readonly Plan[] = [
  {
    name: "Beta miễn phí",
    price: "0đ",
    priceNote: "Trong giai đoạn beta",
    description:
      "Dành cho người dùng thử và góp ý sản phẩm trong giai đoạn đầu.",
    features: [
      "Kho nguồn cá nhân",
      "Nhập nhanh nguồn hàng",
      "Tạo content AI",
      "Upload ảnh căn",
      "Trợ lý đăng bài",
      "Văn phong riêng cơ bản",
    ],
    ctaLabel: "Dùng thử beta",
    ctaHref: "/sign-in",
    highlighted: false,
  },
  {
    name: "Pro cá nhân",
    price: "Dự kiến 199k–299k",
    priceNote: "mỗi tháng",
    description: "Dành cho môi giới cá nhân dùng 1nha hằng ngày.",
    features: [
      "Nhiều căn hơn",
      "Nhiều lượt AI hơn",
      "Nhiều văn phong riêng",
      "Lịch sử content đầy đủ",
      "Trợ lý đăng bài nâng cao",
    ],
    ctaLabel: "Đăng ký quan tâm",
    ctaHref: "/dashboard/billing/upgrade",
    highlighted: true,
  },
  {
    name: "Team",
    price: "Dự kiến từ 1.5 triệu",
    priceNote: "mỗi tháng",
    description:
      "Dành cho nhóm môi giới nhỏ cần quản lý kho nguồn và workflow chung.",
    features: [
      "Kho nguồn nhóm",
      "Quản lý thành viên",
      "Phân quyền",
      "Thiết lập workflow riêng",
      "Hỗ trợ onboarding",
    ],
    ctaLabel: "Liên hệ tư vấn",
    ctaHref: "mailto:feedback@1nha.app",
    highlighted: false,
  },
] as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function PricingPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      {/* Top nav */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <Link
            href="/"
            className="flex flex-col gap-0 outline-none focus-visible:underline"
          >
            <span className="font-heading text-base font-semibold tracking-tight leading-none">
              1nha
            </span>
            <span className="text-[10px] text-muted-foreground leading-none mt-0.5">
              Kho nguồn &amp; trợ lý đăng bài
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/sign-in"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Đăng nhập
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4">
        {/* Hero */}
        <section className="flex flex-col gap-3 pt-10 pb-6">
          <h1 className="text-2xl font-bold tracking-tight leading-tight">
            Bảng giá dự kiến 1nha
          </h1>
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2.5 dark:bg-amber-950/30">
            <span aria-hidden className="mt-px shrink-0 text-sm">📢</span>
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              Hiện tại 1nha đang miễn phí trong giai đoạn beta. Bảng giá dưới
              đây chỉ là định hướng để bạn tham khảo.
            </p>
          </div>
        </section>

        {/* Pricing cards */}
        <section className="flex flex-col gap-4 pb-8">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "flex flex-col gap-4 rounded-xl border p-5",
                plan.highlighted
                  ? "border-foreground bg-card ring-1 ring-foreground/20"
                  : "border-border bg-card"
              )}
            >
              {/* Plan name + highlighted badge */}
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-semibold">{plan.name}</h2>
                {plan.highlighted && (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background">
                    Phổ biến
                  </span>
                )}
              </div>

              {/* Price */}
              <div className="flex flex-col gap-0.5">
                <span className="text-2xl font-bold tracking-tight">
                  {plan.price}
                </span>
                {plan.priceNote && (
                  <span className="text-xs text-muted-foreground">
                    {plan.priceNote}
                  </span>
                )}
              </div>

              {/* Description */}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {plan.description}
              </p>

              {/* Features */}
              <ul className="flex flex-col gap-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <span
                      aria-hidden
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground"
                    >
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {plan.ctaHref.startsWith("mailto:") ? (
                <a
                  href={plan.ctaHref}
                  className={cn(
                    buttonVariants({
                      variant: plan.highlighted ? "default" : "outline",
                    }),
                    "w-full"
                  )}
                >
                  {plan.ctaLabel}
                </a>
              ) : (
                <Link
                  href={plan.ctaHref}
                  className={cn(
                    buttonVariants({
                      variant: plan.highlighted ? "default" : "outline",
                    }),
                    "w-full"
                  )}
                >
                  {plan.ctaLabel}
                </Link>
              )}
            </div>
          ))}
        </section>

        {/* Trust message */}
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 px-5 py-5 mb-4">
          <p className="text-sm font-semibold">🔒 Nguồn của bạn là của bạn</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Khách của bạn là của bạn. 1nha chỉ thu phí phần mềm, không ăn
            phần trăm giao dịch.
          </p>
        </section>

        {/* Beta notice */}
        <section className="pb-10 text-center">
          <p className="text-xs text-muted-foreground leading-relaxed">
            1nha sẽ thông báo trước khi chuyển từ beta miễn phí sang gói trả phí.
          </p>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-4">
          <span className="text-xs text-muted-foreground">© 2025 1nha</span>
          <a
            href="mailto:feedback@1nha.app"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Góp ý
          </a>
        </div>
      </footer>
    </div>
  );
}
