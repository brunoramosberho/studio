import { Skeleton } from "@/components/ui/skeleton";

export default function ScheduleLoading() {
  return (
    <div className="mx-auto max-w-[1200px] px-4">
      <div className="pb-24 pt-4 lg:pb-8 lg:pt-6">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-8 w-24 rounded-full lg:hidden" />
        </div>

        <div className="mb-4 flex gap-2 overflow-hidden lg:hidden">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 w-28 shrink-0 rounded-full" />
          ))}
        </div>

        <div className="hidden lg:mb-5 lg:flex lg:items-center lg:gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-36 rounded-lg" />
          ))}
        </div>

        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-5 w-5 rounded" />
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-14 w-12 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-5 w-5 rounded" />
        </div>

        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-border/50 bg-white p-4">
              <div className="flex items-center gap-4">
                <div className="space-y-1 text-center">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-3 w-8 mx-auto" />
                </div>
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-8 w-20 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
