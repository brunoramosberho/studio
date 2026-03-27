import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageTransition } from "@/components/shared/page-transition";
import { prisma } from "@/lib/db";
import { getServerBranding } from "@/lib/branding.server";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getServerBranding();
  return {
    title: "Nuestros Coaches",
    description: `Conoce a las coaches de ${b.studioName} Studio.`,
  };
}

export default async function CoachesPage() {
  const coaches = await prisma.coachProfile.findMany({
    include: {
      user: { select: { name: true, image: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-4xl pb-2 md:max-w-7xl md:pb-0">
        <div className="mb-5 md:mb-6">
          <Link
            href="/schedule"
            className="inline-flex min-h-11 min-w-11 items-center gap-1 rounded-xl px-1.5 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground active:bg-surface md:-ml-1"
          >
            <ChevronLeft className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
            <span>Volver a horarios</span>
          </Link>
        </div>

        {/* Header: compact on mobile (portal style), hero on desktop */}
        <div className="mb-8 text-left md:mb-14 md:text-center">
          <p className="mb-1 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-accent md:mb-2 md:text-xs">
            Equipo
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl">
            Nuestros coaches
          </h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted md:mx-auto md:mt-4 md:text-lg">
            Expertas certificadas que te guían en cada sesión. Toca una para ver su perfil y reservar sus clases.
          </p>
        </div>

        {coaches.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/60 bg-surface/40 py-12 text-center text-sm text-muted">
            Aún no hay coaches publicados.
          </p>
        ) : (
          <>
            {/* Mobile / small tablet: Siclo-style list rows (full-width tap targets) */}
            <ul className="flex flex-col gap-2 md:hidden">
              {coaches.map((coach) => {
                const photo = coach.photoUrl ?? coach.user.image;
                const name = coach.user.name ?? "Coach";
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
                        "flex min-h-[4.5rem] items-center gap-3.5 rounded-2xl border border-border/50 bg-white px-3.5 py-3",
                        "shadow-[var(--shadow-warm-sm)] transition-colors active:bg-surface",
                      )}
                    >
                      <div className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-accent/15 to-accent-soft/30">
                        {photo ? (
                          <img
                            src={photo}
                            alt={name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-lg font-bold text-accent/50">
                            {initials}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-[15px] font-semibold leading-tight text-foreground">
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
                          <p className="mt-1 text-xs text-muted">Ver horarios y bio</p>
                        )}
                        {coach.bio ? (
                          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted">
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

            {/* Desktop: editorial cards */}
            <div className="hidden gap-6 md:grid md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
              {coaches.map((coach) => {
                const photo = coach.photoUrl ?? coach.user.image;
                const name = coach.user.name ?? "Coach";
                const initials = name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();
                const profileHref = `/my/user/${coach.userId}`;

                return (
                  <Card
                    key={coach.id}
                    className="group overflow-hidden border-border/50 transition-all duration-300 hover:shadow-[var(--shadow-warm-md)]"
                  >
                    <div className="aspect-[3/4] bg-gradient-to-br from-accent/10 via-surface to-accent-soft/20">
                      {photo ? (
                        <img
                          src={photo}
                          alt={name}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-accent/10 text-4xl font-bold text-accent/40 transition-transform group-hover:scale-110">
                            {initials}
                          </div>
                        </div>
                      )}
                    </div>

                    <CardContent className="p-6 lg:p-8">
                      <h2 className="font-display text-xl font-bold text-foreground lg:text-2xl">
                        {name}
                      </h2>

                      {coach.specialties.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {coach.specialties.map((s) => (
                            <Badge key={s} variant="level" className="text-[11px]">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {coach.bio && (
                        <p className="mt-4 text-sm leading-relaxed text-muted line-clamp-4">
                          {coach.bio}
                        </p>
                      )}

                      <Link
                        href={profileHref}
                        className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent transition-colors hover:text-accent/80"
                      >
                        Ver perfil <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </PageTransition>
  );
}
