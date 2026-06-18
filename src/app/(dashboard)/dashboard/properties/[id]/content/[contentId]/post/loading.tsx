import { Skeleton } from "@/components/ui/skeleton";

// Loading skeleton for the Post Assistant: header, property summary,
// content text, and the image picker grid.
export default function PostAssistantLoading() {
  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-52" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>

      {/* Property summary + content cards */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-xl border border-border p-4"
        >
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}

      {/* Image picker grid */}
      <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <Skeleton className="h-5 w-28" />
        <div className="grid grid-cols-3 gap-x-2 gap-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
