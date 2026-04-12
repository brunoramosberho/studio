"use client";

import { Suspense } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { ScheduleClient } from "@/app/(public)/schedule/schedule-client";

export default function CoachSchedulePage() {
  const t = useTranslations("coach");
  const { data: session } = useSession();

  return (
    <Suspense>
      <ScheduleClient
        coachUserId={session?.user?.id}
        classLinkPrefix="/coach/class"
        title={t("mySchedule")}
        hideCoachFilter
        hideCredits
      />
    </Suspense>
  );
}
