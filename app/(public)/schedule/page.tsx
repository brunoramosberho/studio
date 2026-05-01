import { Suspense } from "react";
import { ScheduleClient } from "./schedule-client";
import { getTenant } from "@/lib/tenant";

export const metadata = {
  title: "Horarios",
};

export default async function SchedulePage() {
  const tenant = await getTenant();
  const hideCoachAttribution = !!tenant?.hideCoachUntilClassEnds;
  return (
    <Suspense>
      <ScheduleClient hideCoachAttribution={hideCoachAttribution} />
    </Suspense>
  );
}
