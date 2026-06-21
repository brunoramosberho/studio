"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useCoachMe } from "@/hooks/useCoachMe";
import { motion } from "framer-motion";
import { CalendarDays, Users, ChevronRight, MapPin, Dumbbell } from "lucide-react";
import { format, isPast } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatTime } from "@/lib/utils";
import { getIconComponent } from "@/components/admin/icon-picker";
import type { ClassWithDetails } from "@/types";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

type Tab = "upcoming" | "past";

export default function CoachSchedulePage() {
  const t = useTranslations("coach");
  const locale = useLocale();
  const dateFnsLocale = locale === "en" ? enUS : es;
  // Resolve the coach identity from /api/coach/me (cookie-based, reliable)
  // rather than useSession(), whose shared next-auth singleton can be stale
  // after a client↔coach portal switch and would leave the classes query
  // disabled — showing an empty schedule for a coach who has classes.
  const { data: meData } = useCoachMe();
  const coachUserId = meData?.coach?.userId ?? null;
  const [tab, setTab] = useState<Tab>("upcoming");

  const { data: classes = [], isLoading } = useQuery<ClassWithDetails[]>({
    queryKey: ["coach-schedule-classes", coachUserId ?? "none"],
    enabled: !!coachUserId,
    queryFn: async () => {
      const res = await fetch(`/api/classes?coachId=${coachUserId}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Split into upcoming/past and group by calendar day. Upcoming is sorted
  // soonest-first; past is sorted most-recent-first so the latest class shows up
  // at the top.
  const groups = useMemo(() => {
    const upcoming = classes
      .filter((c) => !isPast(new Date(c.startsAt)))
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
    const past = classes
      .filter((c) => isPast(new Date(c.startsAt)))
      .sort(
        (a, b) =>
          new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
      );

    const groupByDay = (list: ClassWithDetails[]) => {
      const map = new Map<string, ClassWithDetails[]>();
      for (const c of list) {
        const key = format(new Date(c.startsAt), "yyyy-MM-dd");
        const arr = map.get(key) ?? [];
        arr.push(c);
        map.set(key, arr);
      }
      return Array.from(map, ([key, items]) => ({ key, items }));
    };

    return { upcoming: groupByDay(upcoming), past: groupByDay(past) };
  }, [classes]);

  const active = tab === "upcoming" ? groups.upcoming : groups.past;
  const isEmpty = !isLoading && active.length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          {t("mySchedule")}
        </h1>
        <p className="mt-1 text-muted">{t("scheduleSubtitle")}</p>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1">
        {(["upcoming", "past"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              tab === key
                ? "bg-coach/10 text-coach"
                : "text-muted hover:bg-surface",
            )}
          >
            {t(key)}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : isEmpty ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CalendarDays className="h-10 w-10 text-muted/40" />
            <p className="font-medium text-muted">
              {tab === "upcoming"
                ? t("noUpcomingClasses")
                : t("noPastClasses")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          key={tab}
          variants={stagger}
          initial="hidden"
          animate="show"
          className="space-y-6"
        >
          {active.map((day) => (
            <div key={day.key}>
              <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-muted">
                {format(new Date(`${day.key}T00:00:00`), "EEEE d 'de' MMMM", {
                  locale: dateFnsLocale,
                })}
              </h2>
              <div className="space-y-3">
                {day.items.map((cls) => {
                  const enrolled = cls._count?.bookings ?? cls.bookings.length;
                  const capacity = cls.room?.maxCapacity ?? 0;
                  const past = new Date(cls.endsAt) < new Date();
                  return (
                    <motion.div key={cls.id} variants={fadeUp}>
                      <Link href={`/coach/class/${cls.id}`}>
                        <Card
                          className={cn(
                            "transition-all hover:shadow-warm-md",
                            past && "opacity-60",
                          )}
                        >
                          <CardContent className="flex items-center gap-3 p-4">
                            <div className="flex shrink-0 flex-col items-center">
                              <span className="font-mono text-sm font-semibold">
                                {formatTime(cls.startsAt)}
                              </span>
                              <span className="text-xs text-muted">
                                {formatTime(cls.endsAt)}
                              </span>
                            </div>
                            {(() => {
                              const Icon = cls.classType.icon
                                ? getIconComponent(cls.classType.icon)
                                : null;
                              const DiscIcon = Icon ?? Dumbbell;
                              return (
                                <div
                                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                                  style={{ backgroundColor: `${cls.classType.color}18` }}
                                >
                                  <DiscIcon
                                    className="h-5 w-5"
                                    style={{ color: cls.classType.color }}
                                  />
                                </div>
                              );
                            })()}
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-display text-base font-bold">
                                {cls.classType.name}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted">
                                {cls.room?.studio?.name && (
                                  <span className="flex min-w-0 items-center gap-1">
                                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">
                                      {cls.room.studio.name}
                                    </span>
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Users className="h-3.5 w-3.5 shrink-0" />
                                  {enrolled}/{capacity}
                                </span>
                              </div>
                            </div>
                            <Badge
                              variant={
                                past
                                  ? "secondary"
                                  : enrolled >= capacity
                                    ? "danger"
                                    : "success"
                              }
                            >
                              {past
                                ? t("finished")
                                : enrolled >= capacity
                                  ? t("full")
                                  : t("open")}
                            </Badge>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                          </CardContent>
                        </Card>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
