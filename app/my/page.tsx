"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Calendar, ArrowRight, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/shared/page-transition";
import { SocialFeed } from "@/components/feed/social-feed";
import { useQuery } from "@tanstack/react-query";
import { AchievementBadge } from "@/components/feed/achievement-badge";

interface Achievement {
  id: string;
  achievementType: string;
  earnedAt: string;
  label: string;
  icon: string;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] ?? "";

  const { data: achievements } = useQuery<Achievement[]>({
    queryKey: ["achievements", "me"],
    queryFn: async () => {
      const res = await fetch("/api/achievements/me");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!session?.user,
    staleTime: 60_000,
  });

  return (
    <PageTransition>
      <div className="mx-auto max-w-xl space-y-6 pb-24">
        {/* Header */}
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">
            {firstName ? `Hola, ${firstName}` : "Feed del estudio"}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Actividad reciente de la comunidad
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex gap-3">
          <Button asChild size="sm">
            <Link href="/schedule">
              <Calendar className="mr-2 h-4 w-4" />
              Reservar clase
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/my/bookings">
              Mis reservas
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* My achievements banner (if any) */}
        {achievements && achievements.length > 0 && (
          <div className="rounded-2xl border bg-white p-4 shadow-warm-sm">
            <div className="mb-2 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-accent" />
              <span className="text-[13px] font-semibold text-foreground">
                Mis logros
              </span>
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                {achievements.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {achievements.slice(0, 8).map((a) => (
                <AchievementBadge
                  key={a.id}
                  type={a.achievementType}
                  size="sm"
                />
              ))}
            </div>
          </div>
        )}

        {/* Social feed */}
        <SocialFeed />
      </div>
    </PageTransition>
  );
}
