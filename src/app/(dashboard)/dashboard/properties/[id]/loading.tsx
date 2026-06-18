import { Skeleton } from "@/components/ui/skeleton";

// Loading skeleton for property detail: top actions, info card, image
// preview grid, and content history list.
export default function PropertyDetailLoading() {
  return (
    <div className="flex flex-col gap-4">
      {/* Top row */}
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-6 w-20" />
      </div>

      {/* Primary actions */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-11 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 flex-1" />
        </div>
      </div>

      {/* Info card */}
      <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between gap-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>

      {/* Image preview grid */}
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}
