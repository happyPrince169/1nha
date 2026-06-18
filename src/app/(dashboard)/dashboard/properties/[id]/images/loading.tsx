import { Skeleton } from "@/components/ui/skeleton";

// Loading skeleton for the property images page: header, upload card, and a
// stack of image cards.
export default function PropertyImagesLoading() {
  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>

      {/* Upload card */}
      <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-10 w-full" />
      </div>

      {/* Image cards */}
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
