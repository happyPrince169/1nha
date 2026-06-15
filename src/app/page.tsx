import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      {/* ── Top nav ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <div className="flex flex-col gap-0">
            <span className="font-heading text-base font-semibold tracking-tight leading-none">
              1nha
            </span>
            <span className="text-[10px] text-muted-foreground leading-none mt-0.5">
              Kho nguồn &amp; trợ lý đăng bài
            </span>
          </div>
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
              Kho nguồn &amp; trợ lý đăng bài
              <br />
              <span className="text-muted-foreground">cho môi giới BĐS</span>
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed">
              Nhập nguồn một lần. Quản lý căn rõ ràng. Tạo content theo văn
              phong của bạn. Chuẩn bị bài đăng nhanh hơn mỗi ngày.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3">
            <Link
              href="/sign-in"
              className={cn(buttonVariants({ size: "lg" }), "h-12 w-full text-base")}
            >
              Dùng thử bản beta
            </Link>
            <a
              href="#features"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 w-full text-base"
              )}
            >
              Xem cách hoạt động
            </a>
          </div>
        </section>

        {/* ── Feature cards ──────────────────────────────────────────── */}
        <section id="features" className="flex flex-col gap-4 py-8">
          <h2 className="text-lg font-semibold tracking-tight">
            Mọi thứ môi giới cần, trong một nơi
          </h2>

          <div className="flex flex-col gap-3">
            <FeatureCard
              icon="✨"
              title="Nhập nhanh nguồn hàng"
              description="Dán tin nhắn hoặc chụp ảnh màn hình — AI tự bóc tách giá, diện tích, pháp lý, vị trí. Lưu căn trong vài giây."
            />
            <FeatureCard
              icon="🗂️"
              title="Kho nguồn rõ ràng"
              description="Toàn bộ căn đang bán, ảnh và thông tin ở một nơi. Tìm lại, lọc và chăm nguồn cũ dễ dàng."
            />
            <FeatureCard
              icon="✍️"
              title="Content theo văn phong riêng"
              description="Dán bài mẫu, AI học cách bạn viết. Bài AI tạo ra giống phong cách của bạn hơn mỗi lần."
            />
            <FeatureCard
              icon="📣"
              title="Trợ lý đăng bài"
              description="Copy nội dung, chọn ảnh, kiểm tra rồi đăng. 1nha chuẩn bị sẵn gói bài cho Facebook, Zalo hoặc TikTok."
            />
            <FeatureCard
              icon="📅"
              title="Lưu lịch sử đã đăng"
              description="Đánh dấu đã đăng, ghi kênh, link bài. Không bị lễ nguồn nào chưa được chăm."
            />
          </div>
        </section>

        {/* ── Trust block ───────────────────────────────────────────── */}
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 px-5 py-6 mb-2">
          <p className="text-sm font-semibold">🔒 Nguồn của bạn là của bạn</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Khách của bạn là của bạn. 1nha chỉ thu phí phần mềm, không ăn
            phần trăm giao dịch. 1nha chỉ là công cụ giúp bạn làm việc gọn
            hơn, nhanh hơn và chuyên nghiệp hơn.
          </p>
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
            Dùng thử bản beta
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
