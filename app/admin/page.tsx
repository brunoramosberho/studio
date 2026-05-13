"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Clock,
  Package,
  Cake,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useBranding } from "@/components/branding-provider";
import { MgicAIBriefing } from "@/components/admin/MgicAI/BriefingCard";
import { AdminActionItems } from "@/components/admin/action-items";
import {
  OnboardingChecklistHero,
  useOnboardingChecklist,
} from "@/components/admin/onboarding-checklist";
import {
  TodayTimeline,
  type TodayClass,
} from "@/components/admin/dashboard/today-timeline";
import {
  WeekHeatmap,
  type HeatmapClass,
} from "@/components/admin/dashboard/week-heatmap";
import {
  LifecycleFunnel,
  type LifecycleData,
} from "@/components/admin/dashboard/lifecycle-funnel";
import {
  RevenueMixDonut,
  type RevenueMixSlice,
} from "@/components/admin/dashboard/revenue-mix-donut";
import { useTranslations } from "next-intl";
import { timeAgo, formatDate } from "@/lib/utils";

interface DashboardData {
  bookingsToday: number;
  bookingsThisWeek: number;
  revenueThisWeek: number;
  avgOccupancy: number;
  newClientsThisWeek: number;
  popularClassType: string;
  bookingsTodayChange: number;
  revenueWeekChange: number;
  occupancyChange: number;
  newClientsChange: number;
  revenueChart: { name: string; revenue: number }[];
  recentBookings: {
    id: string;
    userName: string;
    className: string;
    createdAt: string;
  }[];
  classesToday: number;
  attendanceToday: number;
  revenueToday: number;
  revenueThisMonth: number;
  revenueMonthChange: number;
  completedClassesMonth: number;
  activeMembersCount: number;
  lowOccupancyClasses: {
    id: string;
    name: string;
    startsAt: string;
    occupancyPct: number;
    enrolled: number;
    capacity: number;
    coachName: string | null;
  }[];
  expiringPackages: {
    userId: string;
    userName: string | null;
    userImage: string | null;
    packageName: string;
    expiresAt: string;
  }[];
  birthdaysThisWeek: {
    id: string;
    name: string | null;
    image: string | null;
    birthday: string;
  }[];
  // Hero visualization data
  todayTimeline: TodayClass[];
  weekHeatmap: HeatmapClass[];
  lifecycle: LifecycleData;
  revenueMix: RevenueMixSlice[];
  activeSubscriptionsCount: number;
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function AdminDashboard() {
  const { studioName } = useBranding();
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["admin-reports"],
    queryFn: async () => {
      const res = await fetch("/api/admin/reports");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });
  const { data: checklist } = useOnboardingChecklist();

  const isEmpty = checklist?.isStudioEmpty === true;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("dashboard")}</h1>
        <p className="mt-1 text-muted">{t("dashboardSummary", { studioName })}</p>
      </motion.div>

      <MgicAIBriefing />

      {/* Empty state: onboarding checklist replaces KPIs/visualizations entirely */}
      {isEmpty && checklist && (
        <OnboardingChecklistHero data={checklist} />
      )}

      {!isEmpty && (
        <>
          <AdminActionItems />

          {/* Hero visualizations replacing the old KPI grid */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="space-y-4"
          >
            {isLoading ? (
              <>
                <Skeleton className="h-32 rounded-2xl" />
                <div className="grid gap-4 lg:grid-cols-3">
                  <Skeleton className="h-48 rounded-2xl" />
                  <Skeleton className="h-48 rounded-2xl" />
                  <Skeleton className="h-48 rounded-2xl" />
                </div>
              </>
            ) : (
              <>
                <motion.div variants={fadeUp}>
                  <TodayTimeline classes={data?.todayTimeline ?? []} />
                </motion.div>
                <div className="grid gap-4 lg:grid-cols-3">
                  <motion.div variants={fadeUp}>
                    <WeekHeatmap classes={data?.weekHeatmap ?? []} />
                  </motion.div>
                  <motion.div variants={fadeUp}>
                    <LifecycleFunnel
                      data={
                        data?.lifecycle ?? {
                          lead: 0,
                          installed: 0,
                          purchased: 0,
                          booked: 0,
                          attended: 0,
                          member: 0,
                        }
                      }
                    />
                  </motion.div>
                  <motion.div variants={fadeUp}>
                    <RevenueMixDonut
                      mix={data?.revenueMix ?? []}
                      activeSubsCount={data?.activeSubscriptionsCount ?? 0}
                    />
                  </motion.div>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}

      {!isEmpty && (
      <>
      {/* Recent bookings — live activity feed */}
      {!isLoading && data?.recentBookings && data.recentBookings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl border border-border/60 bg-card p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted/60">
              {t("recentBookings")}
            </h2>
            <Link
              href="/admin/clients"
              className="text-xs font-medium text-muted hover:text-foreground"
            >
              {t("weeklyOutlook.viewAll")}
            </Link>
          </div>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {data.recentBookings.slice(0, 6).map((booking) => (
              <div key={booking.id} className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-admin/10">
                  <span className="text-xs font-semibold text-admin">
                    {booking.userName?.[0] ?? "?"}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{booking.userName}</p>
                  <p className="truncate text-xs text-muted">{booking.className}</p>
                </div>
                <span className="shrink-0 text-xs text-muted">
                  {timeAgo(booking.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Esta semana — operational outlook (consistent with hero language) */}
      {!isLoading &&
        ((data?.lowOccupancyClasses?.length ?? 0) > 0 ||
          (data?.expiringPackages?.length ?? 0) > 0 ||
          (data?.birthdaysThisWeek?.length ?? 0) > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="grid gap-4 lg:grid-cols-3"
          >
            {/* Low occupancy */}
            {data?.lowOccupancyClasses && data.lowOccupancyClasses.length > 0 && (
              <WeeklySection
                icon={Clock}
                label={t("weeklyOutlook.lowOccupancy")}
                count={data.lowOccupancyClasses.length}
                href="/admin/schedule"
              >
                {data.lowOccupancyClasses.slice(0, 4).map((c) => (
                  <Link
                    key={c.id}
                    href={`/admin/class/${c.id}`}
                    className="group flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-surface/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground/90">
                        {c.name}
                      </p>
                      <p className="truncate text-[11px] text-muted/70">
                        {c.coachName ?? t("weeklyOutlook.noCoach")} · {c.enrolled}/{c.capacity}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-red-500/10 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-red-600">
                      {c.occupancyPct}%
                    </span>
                  </Link>
                ))}
              </WeeklySection>
            )}

            {/* Expiring packages */}
            {data?.expiringPackages && data.expiringPackages.length > 0 && (
              <WeeklySection
                icon={Package}
                label={t("weeklyOutlook.expiringPackages")}
                count={data.expiringPackages.length}
                href="/admin/clients"
              >
                {data.expiringPackages.slice(0, 4).map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground/90">
                        {p.userName ?? tc("noName")}
                      </p>
                      <p className="truncate text-[11px] text-muted/70">
                        {p.packageName}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted/70">
                      {formatDate(p.expiresAt)}
                    </span>
                  </div>
                ))}
              </WeeklySection>
            )}

            {/* Birthdays */}
            {data?.birthdaysThisWeek && data.birthdaysThisWeek.length > 0 && (
              <WeeklySection
                icon={Cake}
                label={t("weeklyOutlook.birthdaysThisWeek")}
                count={data.birthdaysThisWeek.length}
                href="/admin/clients"
              >
                {data.birthdaysThisWeek.slice(0, 4).map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pink-500/10">
                      <span className="text-[11px] font-semibold text-pink-600">
                        {(u.name ?? "?")[0]}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground/90">
                        {u.name ?? tc("noName")}
                      </p>
                      <p className="truncate text-[11px] text-muted/70">
                        {new Date(u.birthday).toLocaleDateString("es", {
                          day: "numeric",
                          month: "long",
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </WeeklySection>
            )}
          </motion.div>
        )}
      </>
      )}
    </div>
  );
}

/**
 * Compact card matching the hero widget language — small uppercase label,
 * count, child list, and a "Ver todo" link. Used by the "Esta semana"
 * operational outlook (low occupancy, expiring packages, birthdays).
 */
function WeeklySection({
  icon: Icon,
  label,
  count,
  href,
  children,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 shrink-0 text-muted/70" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted/60 truncate">
            {label}
          </span>
          <span className="shrink-0 rounded-full bg-foreground/[0.06] px-1.5 py-px text-[10px] font-bold tabular-nums text-foreground/70">
            {count}
          </span>
        </div>
        <Link
          href={href}
          className="group inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
        >
          <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
