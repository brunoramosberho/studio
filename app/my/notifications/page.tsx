"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";
import { BellIcon } from "lucide-animated";
import { UserAvatar, type UserAvatarUser } from "@/components/ui/user-avatar";
import { PageTransition } from "@/components/shared/page-transition";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface NotificationItem {
  id: string;
  type: string;
  readAt: string | null;
  createdAt: string;
  feedEventId: string | null;
  actorId: string | null;
  actor: { id: string; name: string | null; image: string | null; hasActiveMembership?: boolean; level?: string | null } | null;
}

function getNotificationHref(n: NotificationItem): string | null {
  switch (n.type) {
    case "FRIEND_REQUEST":
      return "/my/friends";
    case "FRIEND_ACCEPTED":
      return n.actorId ? `/my/user/${n.actorId}` : "/my/friends";
    case "LIKE":
    case "KUDOS":
    case "COMMENT":
      return n.feedEventId ? `/my?post=${n.feedEventId}` : "/my";
    case "REFERRAL_JOINED":
    case "REFERRAL_REWARD":
      return "/my/referrals";
    case "ACHIEVEMENT":
      return "/my/profile";
    case "CLASS_REMINDER":
    case "WAITLIST_PROMOTED":
      return "/my/bookings";
    case "SPOT_AVAILABLE":
      return "/schedule";
    default:
      return null;
  }
}

// typeLabels is defined inside the component to access translations

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

export default function NotificationsPage() {
  const t = useTranslations("member");
  const typeLabels: Record<string, string> = {
    FRIEND_REQUEST: t("notifFriendRequest"),
    FRIEND_ACCEPTED: t("notifFriendAccepted"),
    LIKE: t("notifLike"),
    KUDOS: t("notifKudos"),
    REFERRAL_JOINED: t("notifReferralJoined"),
    REFERRAL_REWARD: t("notifReferralReward"),
    REFERRAL_MANUAL_REWARD: t("notifReferralManualReward"),
    COMMENT: t("notifComment"),
    ACHIEVEMENT: t("notifAchievement"),
    CLASS_REMINDER: t("notifClassReminder"),
    WAITLIST_PROMOTED: t("notifWaitlistPromoted"),
    SPOT_AVAILABLE: t("notifSpotAvailable"),
  };
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => {
        setNotifications(data.notifications ?? []);
        if ((data.unreadCount ?? 0) > 0) {
          fetch("/api/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "read-all" }),
          }).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageTransition>
      <div className="pb-24">
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-surface"
          >
            <ChevronLeft className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="font-display text-xl font-bold text-foreground">
            {t("notifications")}
          </h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-card py-16 text-center">
            <div className="mx-auto w-fit"><BellIcon size={40} className="text-muted/20" /></div>
            <p className="mt-3 text-[15px] font-medium text-foreground">
              {t("noNotifications")}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              {t("noNotificationsDesc")}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
            {notifications.map((n, i) => {
              const href = getNotificationHref(n);
              const content = (
                <>
                  {n.actor ? (
                    <UserAvatar
                      user={n.actor as UserAvatarUser}
                      size={40}
                      className="flex-shrink-0"
                    />
                  ) : (
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface">
                      <BellIcon size={16} className="text-muted" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-snug text-foreground">
                      {n.actor?.name && (
                        <span className="font-semibold">
                          {n.actor.name.split(" ")[0]}{" "}
                        </span>
                      )}
                      <span className="text-muted">
                        {typeLabels[n.type] ?? n.type}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted/70">
                      {timeAgo(n.createdAt)}
                    </p>
                  </div>
                  {!n.readAt && (
                    <div className="mt-2 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-accent" />
                  )}
                </>
              );

              const className = cn(
                "flex items-start gap-3 px-4 py-3.5",
                !n.readAt && "bg-accent/5",
                i < notifications.length - 1 && "border-b border-border/30",
                href && "cursor-pointer active:bg-surface/50 transition-colors",
              );

              return href ? (
                <button
                  key={n.id}
                  className={cn(className, "w-full text-left")}
                  onClick={() => router.push(href)}
                >
                  {content}
                </button>
              ) : (
                <div key={n.id} className={className}>
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
