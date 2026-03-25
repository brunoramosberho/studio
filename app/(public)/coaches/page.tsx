import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageTransition } from "@/components/shared/page-transition";
import { prisma } from "@/lib/db";
import { getServerBranding } from "@/lib/branding.server";

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
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <h1 className="font-display text-4xl font-bold text-foreground sm:text-5xl">
            Nuestros Coaches
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-lg text-muted">
            Expertas apasionadas y certificadas que te guiarán en cada
            movimiento.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {coaches.map((coach) => {
            const photo = coach.photoUrl ?? coach.user.image;
            const name = coach.user.name ?? "Coach";
            const initials = name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2);

            return (
              <Card
                key={coach.id}
                className="group overflow-hidden transition-all duration-300 hover:shadow-[var(--shadow-warm-md)]"
              >
                <div className="aspect-[3/4] bg-gradient-to-br from-accent/10 via-surface to-accent-soft/20">
                  {photo ? (
                    <img
                      src={photo}
                      alt={name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="flex h-28 w-28 items-center justify-center rounded-full bg-accent/10 text-4xl font-bold text-accent/40 transition-transform group-hover:scale-110">
                        {initials}
                      </div>
                    </div>
                  )}
                </div>

                <CardContent className="p-8">
                  <h2 className="font-display text-2xl font-bold text-foreground">
                    {name}
                  </h2>

                  {coach.specialties.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {coach.specialties.map((s) => (
                        <Badge key={s} variant="level">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {coach.bio && (
                    <p className="mt-4 text-sm leading-relaxed text-muted">
                      {coach.bio}
                    </p>
                  )}

                  <Link
                    href="/schedule"
                    className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:text-accent/80"
                  >
                    Ver clases <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </PageTransition>
  );
}
