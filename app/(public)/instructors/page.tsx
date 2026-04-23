import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageTransition } from "@/components/shared/page-transition";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getTenant } from "@/lib/tenant";
import { getServerBranding } from "@/lib/branding.server";
import { cn } from "@/lib/utils";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getServerBranding();
  return {
    title: "Our Team",
    description: `Meet the team at ${b.studioName} Studio.`,
  };
}

export default async function CoachesPage() {
  const t = await getTranslations("public");
  const [tenant, session] = await Promise.all([getTenant(), auth()]);

  const coaches = tenant
    ? await prisma.coachProfile.findMany({
        where: { tenantId: tenant.id },
        include: {
          user: { select: { name: true, image: true } },
        },
        orderBy: { name: "asc" },
      })
    : [];

  const isAuthenticated = !!session?.user;

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-4xl pb-2 md:pb-6">
        {isAuthenticated && (
          <div className="mb-5 md:mb-6">
            <Link
              href="/schedule"
              className="inline-flex min-h-11 min-w-11 items-center gap-1 rounded-xl px-1.5 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground active:bg-surface md:-ml-1"
            >
              <ChevronLeft className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
              <span>{t("backToSchedule")}</span>
            </Link>
          </div>
        )}

        <div className="mb-6 text-left md:mb-10">
          <p className="mb-1 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-accent md:text-xs">
            {t("team")}
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground md:text-4xl">
            {t("ourCoaches")}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted md:text-base">
            {t("coachesPageDesc")}
          </p>
        </div>

        {coaches.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/60 bg-surface/40 py-12 text-center text-sm text-muted">
            {t("noCoachesPublished")}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3">
            {coaches.map((coach) => {
              const photo = coach.photoUrl ?? coach.user?.image;
              const name = coach.name || "Instructor";
              const initials = name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              const profileHref = `/my/user/${coach.userId}`;

              return (
                <li key={coach.id}>
                  <Link
                    href={profileHref}
                    className={cn(
                      "flex min-h-[5rem] items-center gap-4 rounded-2xl border border-border/50 bg-card px-4 py-3",
                      "shadow-[var(--shadow-warm-sm)] transition-all active:bg-surface md:hover:shadow-[var(--shadow-warm-md)]",
                    )}
                  >
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-accent/15 to-accent-soft/30 md:h-[4.5rem] md:w-[4.5rem]">
                      {photo ? (
                        <img
                          src={photo}
                          alt={name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-base font-bold text-accent/50 md:text-lg">
                          {initials}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-[15px] font-semibold leading-tight text-foreground md:text-base">
                        {name}
                      </p>
                      {coach.specialties.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {coach.specialties.slice(0, 3).map((s) => (
                            <span
                              key={s}
                              className="inline-flex max-w-full truncate rounded-full bg-accent-soft/40 px-2 py-0.5 text-[10px] font-medium text-accent"
                            >
                              {s}
                            </span>
                          ))}
                          {coach.specialties.length > 3 ? (
                            <span className="text-[10px] font-medium text-muted">
                              +{coach.specialties.length - 3}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-muted">{t("viewScheduleAndBio")}</p>
                      )}
                      {coach.bio ? (
                        <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted md:text-xs">
                          {coach.bio}
                        </p>
                      ) : null}
                    </div>
                    <ChevronRight
                      className="h-5 w-5 shrink-0 text-muted/50"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageTransition>
  );
}
