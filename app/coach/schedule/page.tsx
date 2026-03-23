"use client";

import { useSession } from "next-auth/react";
import { ScheduleClient } from "@/app/(public)/schedule/schedule-client";

export default function CoachSchedulePage() {
  const { data: session } = useSession();

  return (
    <ScheduleClient
      coachUserId={session?.user?.id}
      classLinkPrefix="/coach/class"
      title="Mi Horario"
      hideCoachFilter
      hideCredits
    />
  );
}
