import { Suspense } from "react";
import { ScheduleClient } from "./schedule-client";

export const metadata = {
  title: "Horarios",
};

export default function SchedulePage() {
  return (
    <Suspense>
      <ScheduleClient />
    </Suspense>
  );
}
