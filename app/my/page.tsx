"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { Calendar, ArrowRight, Users, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/shared/page-transition";
import { SocialFeed } from "@/components/feed/social-feed";
import { useQuery } from "@tanstack/react-query";

export default function DashboardPage() {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] ?? "";

  const { data: notifData } = useQuery<{ unreadCount: number }>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      if (!res.ok) return { unreadCount: 0 };
      return res.json();
    },
    enabled: !!session?.user,
  });
  const unreadCount = notifData?.unreadCount ?? 0;

  return (
    <PageTransition>
      <div className="mx-auto max-w-xl space-y-5 pb-24">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">
              {firstName ? `Hola, ${firstName}` : "Feed"}
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Actividad de la comunidad
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/my/friends"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors active:bg-surface"
            >
              <Users className="h-5 w-5" />
            </Link>
            <Link
              href="/my/notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors active:bg-surface"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-3">
          <Button asChild size="sm">
            <Link href="/schedule">
              <Calendar className="mr-2 h-4 w-4" />
              Reserva
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/my/bookings">
              Mis reservas
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Social feed with filter tabs */}
        <SocialFeed />
      </div>
    </PageTransition>
  );
}
