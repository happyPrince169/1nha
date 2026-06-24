// ---------------------------------------------------------------------------
// Permission notices (Phase 4C) — small server components reused across the
// property/content/image pages so the read-only + forbidden copy stays
// consistent. The service layer is the real boundary; these only reflect it.
// ---------------------------------------------------------------------------
import Link from "next/link";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const DEFAULT_REASON =
  "Chỉ người tạo, người phụ trách hoặc quản trị viên mới có thể thực hiện.";

/** Inline muted note shown above read-only content. */
export function ReadOnlyNote({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
      🔒 {message}
    </p>
  );
}

/** Full friendly forbidden block — used in place of an editable form/page. */
export function ManageForbidden({
  title = "Bạn chỉ có quyền xem",
  message = DEFAULT_REASON,
  backHref,
  backLabel = "← Quay lại",
}: {
  title?: string;
  message?: string;
  backHref: string;
  backLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-2xl"
        aria-hidden
      >
        🔒
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
      </div>
      <Link
        href={backHref}
        className={cn(buttonVariants({ variant: "outline" }), "w-full")}
      >
        {backLabel}
      </Link>
    </div>
  );
}
