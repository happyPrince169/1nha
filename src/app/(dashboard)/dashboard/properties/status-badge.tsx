import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: string | null | undefined;
};

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  available: {
    label: "Đang bán",
    className: "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  },
  rented: {
    label: "Đã cho thuê",
    className: "border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  },
  sold: {
    label: "Đã bán",
    className: "border-violet-500/30 bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-400",
  },
  pending: {
    label: "Đang giữ",
    className: "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  },
  archived: {
    label: "Lưu trữ",
    className: "border-border bg-muted text-muted-foreground",
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const key = status ?? "";
  const config = STATUS_CONFIG[key];

  return (
    <Badge
      variant="outline"
      className={cn(config?.className)}
    >
      {config?.label ?? status ?? "-"}
    </Badge>
  );
}
