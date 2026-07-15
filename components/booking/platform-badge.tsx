import type { PlatformType } from "@prisma/client";
import { partnerLabel } from "@/lib/platforms/labels";
import { cn } from "@/lib/utils";

/**
 * Partner reservations (Wellhub & co.) live alongside the member's own
 * bookings. They look identical otherwise, so we label the source: the member
 * needs to know which ones they booked here — and which they must cancel in
 * the partner's app, since we cannot cancel on their behalf.
 */
export function PlatformBadge({
  platform,
  className,
}: {
  platform: PlatformType;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex-shrink-0 rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-semibold text-foreground/70",
        className,
      )}
    >
      {partnerLabel(platform)}
    </span>
  );
}
