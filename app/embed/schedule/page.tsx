import { Suspense } from "react";
import { headers } from "next/headers";
import { EmbedScheduleClient } from "./embed-schedule-client";

export const dynamic = "force-dynamic";

export default async function EmbedSchedulePage() {
  const h = await headers();
  const host = h.get("host") || "";
  const protocol = host.includes("localhost") ? "http" : "https";
  const tenantOrigin = `${protocol}://${host}`;

  return (
    <Suspense>
      <EmbedScheduleClient tenantOrigin={tenantOrigin} />
    </Suspense>
  );
}
