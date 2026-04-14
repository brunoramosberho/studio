import { Skeleton } from "@/components/ui/skeleton";

export default function FeedLoading() {
  return (
    <div className="mx-auto max-w-xl space-y-5 pb-24">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-52" />
        </div>
        <div className="flex gap-1">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
      </div>

      <div className="flex gap-3">
        <Skeleton className="h-9 w-36 rounded-xl" />
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>

      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
