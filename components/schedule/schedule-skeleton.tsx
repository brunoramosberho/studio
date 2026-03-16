import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-white p-4 shadow-[var(--shadow-warm-sm)]",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <Skeleton className="h-4 w-12 rounded-md" />
          <Skeleton className="h-3 w-8 rounded-md" />
        </div>
        <div className="flex-1 space-y-2.5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-28 rounded-md" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-3.5 w-20 rounded-md" />
          </div>
          <Skeleton className="h-3 w-16 rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function FilterBarSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-28 shrink-0 rounded-full" />
      ))}
    </div>
  );
}

export function WeekViewSkeleton() {
  return (
    <div>
      {/* Navigation skeleton */}
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <Skeleton className="h-6 w-48 rounded-md" />
        <Skeleton className="h-10 w-10 rounded-xl" />
      </div>

      {/* Mobile day selector */}
      <div className="mb-4 flex gap-1 md:hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-[52px] shrink-0 rounded-2xl" />
        ))}
      </div>

      {/* Mobile day cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>

      {/* Desktop grid */}
      <div className="hidden md:grid md:grid-cols-7 md:gap-3">
        {Array.from({ length: 7 }).map((_, dayIdx) => (
          <div key={dayIdx}>
            <Skeleton className="mb-3 h-16 w-full rounded-xl" />
            <div className="flex flex-col gap-2">
              {Array.from({ length: dayIdx % 3 === 0 ? 1 : 2 }).map(
                (_, cardIdx) => (
                  <CardSkeleton key={cardIdx} />
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DayViewSkeleton() {
  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-col items-center gap-1">
        <Skeleton className="h-6 w-32 rounded-md" />
        <Skeleton className="h-4 w-44 rounded-md" />
      </div>

      {/* Timeline */}
      <div className="relative ml-16 border-l border-border/30">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="relative flex h-20 items-start border-b border-border/20"
          >
            <Skeleton className="absolute -left-16 top-0 h-4 w-10 rounded-md" />
          </div>
        ))}
        <CardSkeleton className="absolute inset-x-2 top-0 h-[76px]" />
        <CardSkeleton className="absolute inset-x-2 top-[160px] h-[76px]" />
        <CardSkeleton className="absolute inset-x-2 top-[320px] h-[76px]" />
      </div>
    </div>
  );
}

export function ScheduleSkeleton() {
  return (
    <div className="space-y-6">
      <FilterBarSkeleton />
      <WeekViewSkeleton />
    </div>
  );
}
