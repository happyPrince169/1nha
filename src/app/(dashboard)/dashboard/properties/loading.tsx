import { Skeleton } from "@/components/ui/skeleton";

// Loading skeleton for the property inventory list. Mirrors the header +
// filter row + stacked PropertyCard layout so navigation feels instant.
export default function PropertiesLoading() {
  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>

      {/* Tabs + filter bar */}
      <div className="flex gap-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-7 w-20" />
      </div>
      <Skeleton className="h-10 w-full" />

      {/* Property cards */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-stretch gap-3 rounded-xl border border-border p-3"
          >
            <Skeleton className="h-[88px] w-[88px] shrink-0 rounded-lg" />
            <div className="flex flex-1 flex-col justify-between gap-2 py-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
