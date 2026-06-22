import { Skeleton } from "@/components/ui/skeleton";

// A `loading.tsx` gives the /class/[id] segment its own Suspense boundary.
// The page is a Client Component that calls `useSearchParams()` (added with
// guest checkout), which suspends during render. Without a boundary the
// client-side soft-navigation transition into this route has nothing to catch
// that suspense, so the navigation never commits — clicking a class on
// /schedule silently does nothing (the router stays on the old page, no error).
// Full page loads worked because there's no transition to stall. /schedule
// already has its own loading.tsx for the same reason. See git history /
// the schedule loading skeleton for the matching pattern.
export default function ClassLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Back + share row */}
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>

      {/* Hero / discipline media */}
      <Skeleton className="mb-6 h-44 w-full rounded-3xl" />

      {/* Title + time */}
      <Skeleton className="mb-2 h-8 w-2/3" />
      <Skeleton className="mb-6 h-4 w-1/2" />

      {/* Coach row */}
      <div className="mb-6 flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>

      {/* Description lines */}
      <div className="mb-8 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>

      {/* Reserve CTA */}
      <Skeleton className="h-12 w-full rounded-2xl" />
    </div>
  );
}
