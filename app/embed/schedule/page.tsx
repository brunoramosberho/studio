import { Suspense } from "react";
import { headers } from "next/headers";
import { differenceInCalendarDays, startOfDay } from "date-fns";
import { getTenant } from "@/lib/tenant";
import {
  computeVisibleUntil,
  resolveScheduleTimezone,
} from "@/lib/schedule/visibility";
import { EmbedScheduleClient } from "./embed-schedule-client";

export const dynamic = "force-dynamic";

export default async function EmbedSchedulePage() {
  const h = await headers();
  const host = h.get("host") || "";
  const protocol = host.includes("localhost") ? "http" : "https";
  const tenantOrigin = `${protocol}://${host}`;

  // Mirror the public /schedule visibility window so the embed shows the same
  // range of days the studio configured (rolling N days or weekly release),
  // instead of a hardcoded 7-day strip that hid classes scheduled further out.
  let visibleDays = 7;
  const tenant = await getTenant();
  if (tenant) {
    const now = new Date();
    const tz = await resolveScheduleTimezone(tenant);
    const until = computeVisibleUntil(now, tenant, tz);
    const diff = differenceInCalendarDays(startOfDay(until), startOfDay(now)) + 1;
    visibleDays = Math.max(1, Math.min(120, diff));
  }

  return (
    <Suspense>
      <EmbedScheduleClient tenantOrigin={tenantOrigin} visibleDays={visibleDays} />
    </Suspense>
  );
}
