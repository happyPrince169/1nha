import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      {/* ── Top nav ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <span className="font-heading text-base font-semibold tracking-tight">
            1nha
          </span>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
              Beta
            </span>
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
        {/* ── Hero ───────────────────────────────────────────────────── */}
        <section className="flex flex-col items-start gap-5 py-12">
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-bold tracking-tight leading-tight">
              Nhập căn một lần.
              <br />
              Có content cả tháng.
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed">
              Trợ lý AI giúp môi giới bất động sản lưu nguồn hàng, tạo bài
              đăng và quản lý content nhanh hơn.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3">
            <Link
              href="/sign-in"
              className={cn(buttonVariants({ size: "lg" }), "h-12 w-full text-base")}
            >
              Dùng thử beta
            </Link>
            <a
              href="#demo"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 w-full text-base"
              )}
            >
              Xem demo workflow
            </a>
          </div>
        </section>

        {/* ── Feature cards ──────────────────────────────────────────── */}
        <section id="demo" className="flex flex-col gap-4 py-8">
          <h2 className="text-lg font-semibold tracking-tight">
            Mọi thứ môi giới cần, trong một app
          </h2>

          <div className="flex flex-col gap-3">
            <FeatureCard
              icon="✨"
              title="Nhập nhanh bằng AI"
              description="Dán tin nhắn hoặc chụp ảnh màn hình — AI tự điền đầy đủ thông tin căn: giá, diện tích, pháp lý, vị trí."
            />
            <FeatureCard
              icon="📝"
              title="Tạo content bán nhà"
              description="Chọn nền tảng, giọng văn, loại bài — 1nha viết bài đăng Facebook, Zalo, TikTok sẵn sàng copy."
            />
            <FeatureCard
              icon="📂"
              title="Quản lý lịch sử bài đăng"
              description="Tất cả content đã tạo được lưu theo từng căn. Tìm lại, sao chép và tái sử dụng bất cứ lúc nào."
            />
          </div>
        </section>

        {/* ── Bottom CTA ─────────────────────────────────────────────── */}
        <section className="flex flex-col items-center gap-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Miễn phí trong giai đoạn beta. Không cần thẻ tín dụng.
          </p>
          <Link
            href="/sign-in"
            className={cn(buttonVariants({ size: "lg" }), "h-12 w-full text-base")}
          >
            Bắt đầu miễn phí
          </Link>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────── */}
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

// ---------------------------------------------------------------------------
// FeatureCard
// ---------------------------------------------------------------------------
function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4 rounded-xl border border-border bg-card p-4 ring-1 ring-foreground/10">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-xl"
        aria-hidden
      >
        {icon}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
