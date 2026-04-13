"use client";

import { useSession } from "next-auth/react";
import { useRef, useEffect } from "react";
import Link from "next/link";
import { Calendar, ArrowRight, Users } from "lucide-react";
import { BellIcon, type BellIconHandle } from "lucide-animated";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { PageTransition } from "@/components/shared/page-transition";
import { SocialFeed } from "@/components/feed/social-feed";
import { UpcomingClasses } from "@/components/feed/upcoming-classes";
import { FriendsClasses } from "@/components/feed/friends-classes";
import { FeedHighlights } from "@/components/feed/feed-highlights";
import { useQuery } from "@tanstack/react-query";
import { getLoyaltyTierVisual } from "@/lib/loyalty-tier";
import { useBranding } from "@/components/branding-provider";
import { useTranslations } from "next-intl";

interface FeedHeaderData {
  hasActiveMembership: boolean;
  level: { name: string; icon: string; sortOrder: number } | null;
}

export default function DashboardPage() {
  const t = useTranslations("member");
  const { data: session } = useSession();
  const { communityHeadline } = useBranding();
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

  const bellRef = useRef<BellIconHandle>(null);
  useEffect(() => {
    if (unreadCount > 0) {
      const timer = setTimeout(() => bellRef.current?.startAnimation(), 600);
      return () => clearTimeout(timer);
    }
  }, [unreadCount]);

  const { data: headerData } = useQuery<FeedHeaderData>({
    queryKey: ["feed-header"],
    queryFn: async () => {
      const res = await fetch("/api/gamification/me");
      if (!res.ok) return { hasActiveMembership: false, level: null };
      const data = await res.json();
      return {
        hasActiveMembership: data.hasActiveMembership ?? false,
        level: data.level ?? null,
      };
    },
    enabled: !!session?.user,
  });

  const { data: upcomingBookings = [] } = useQuery<unknown[]>({
    queryKey: ["bookings", "upcoming"],
    queryFn: async () => {
      const res = await fetch("/api/bookings?status=upcoming");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!session?.user,
    staleTime: 30_000,
  });

  const hasActiveMembership = headerData?.hasActiveMembership ?? false;
  const level = headerData?.level ?? null;

  return (
    <PageTransition>
      <div className="mx-auto max-w-xl space-y-5 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/my/profile" className="shrink-0">
            <UserAvatar
              user={{
                image: session?.user?.image,
                name: session?.user?.name,
                hasActiveMembership,
                level: level ? getLoyaltyTierVisual(level.name, level.sortOrder) : null,
              }}
              size={40}
            />
          </Link>

          {/* Greeting */}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-bold text-foreground">
              {firstName ? t("greeting", { name: firstName }) : t("feed")}
            </h1>
            <p className="text-xs text-muted">
              {communityHeadline}
            </p>
          </div>

          {/* Icons */}
          <div className="flex shrink-0 items-center gap-0.5">
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
              <BellIcon ref={bellRef} size={20} />
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
              {t("book")}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/my/bookings">
              {t("myBookings")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Upcoming booked classes — or friends' classes as fallback */}
        <UpcomingClasses />
        {upcomingBookings.length === 0 && <FriendsClasses />}

        {/* Highlighted banners from admin */}
        <FeedHighlights />

        {/* Social feed with filter tabs */}
        <SocialFeed />
      </div>
    </PageTransition>
  );
}
