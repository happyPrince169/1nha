import { cn } from "@/lib/utils";
import type { ContentStatus } from "@/types";

// ---------------------------------------------------------------------------
// Label + colour mapping for content lifecycle statuses
// ---------------------------------------------------------------------------
export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "Bản nháp",
  scheduled: "Đã lên lịch",
  posted: "Đã đăng",
  archived: "Lưu trữ",
};

const STATUS_CLASSES: Record<ContentStatus, string> = {
  draft:
    "bg-muted text-muted-foreground border-border",
  scheduled:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  posted:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  archived:
    "bg-muted/50 text-muted-foreground/60 border-border line-through",
};

type Props = {
  status: ContentStatus;
  className?: string;
};

export function ContentStatusBadge({ status, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        STATUS_CLASSES[status] ?? STATUS_CLASSES.draft,
        className
      )}
    >
      {CONTENT_STATUS_LABELS[status] ?? status}
    </span>
  );
}
