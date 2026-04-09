"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Bell, Loader2 } from "lucide-react";
import { UserAvatar, type UserAvatarUser } from "@/components/ui/user-avatar";
import { PageTransition } from "@/components/shared/page-transition";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  type: string;
  readAt: string | null;
  createdAt: string;
  actor: { id: string; name: string | null; image: string | null; hasActiveMembership?: boolean; level?: string | null } | null;
}

const typeLabels: Record<string, string> = {
  FRIEND_REQUEST: "te envió solicitud de amistad",
  FRIEND_ACCEPTED: "aceptó tu solicitud",
  LIKE: "le dio like a tu post",
  KUDOS: "te dio kudos 🙌",
  REFERRAL_JOINED: "se unió con tu invitación 🎉",
  REFERRAL_REWARD: "desbloqueó tu premio de referido 🎁",
  REFERRAL_MANUAL_REWARD: "desbloqueó un premio — pendiente de entregar",
  COMMENT: "comentó en tu post",
  ACHIEVEMENT: "desbloqueó un logro",
  CLASS_REMINDER: "Tu clase empieza pronto",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

export default function NotificationsPage() {
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
            Notificaciones
          </h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-white py-16 text-center">
            <Bell className="mx-auto h-10 w-10 text-muted/20" />
            <p className="mt-3 text-[15px] font-medium text-foreground">
              Sin notificaciones
            </p>
            <p className="mt-1 text-[13px] text-muted">
              Aquí aparecerán tus likes, comentarios y solicitudes
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/50 bg-white">
            {notifications.map((n, i) => (
              <div
                key={n.id}
                className={cn(
                  "flex items-start gap-3 px-4 py-3.5",
                  !n.readAt && "bg-accent/5",
                  i < notifications.length - 1 && "border-b border-border/30",
                )}
              >
                {n.actor ? (
                  <UserAvatar
                    user={n.actor as UserAvatarUser}
                    size={40}
                    className="flex-shrink-0"
                  />
                ) : (
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface">
                    <Bell className="h-4 w-4 text-muted" />
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
              </div>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
