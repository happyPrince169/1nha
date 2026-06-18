import { cn } from "@/lib/utils";

/**
 * Skeleton — lightweight loading placeholder. Pure Tailwind, no new deps.
 * Use inside loading.tsx files to make heavy route navigation feel instant.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
