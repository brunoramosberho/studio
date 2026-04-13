"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { Share, Check } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatTime, formatTimeRange } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface FriendInfo {
  id: string;
  name: string | null;
  image: string | null;
}

interface FriendBookedClass {
  classId: string;
  friendsGoing: FriendInfo[];
  class: {
    startsAt: string;
    endsAt: string;
    classType: { name: string; color: string; duration: number; icon?: string | null };
    coach: { name: string; photoUrl?: string | null; user?: { name?: string | null; image?: string | null } | null };
    room?: { studio?: { name?: string } };
    spotsLeft?: number | null;
  };
}

export function FriendsClasses() {
  const { data: session } = useSession();
  const t = useTranslations("feed");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: friendClasses = [] } = useQuery<FriendBookedClass[]>({
    queryKey: ["classes", "friends-bookings"],
    queryFn: async () => {
      const res = await fetch("/api/classes/friends-bookings");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!session?.user,
    staleTime: 60_000,
  });

  const handleShare = useCallback(async (c: FriendBookedClass) => {
    const classUrl = `${window.location.origin}/class/${c.classId}`;
    const date = new Date(c.class.startsAt);
    const dayStr = date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
    const timeStr = formatTimeRange(c.class.startsAt, c.class.endsAt);
    const text = `${c.class.classType.name} con ${c.class.coach.name}\n${dayStr}, ${timeStr}\n¡Reserva tu lugar!`;

    if (navigator.share) {
      try {
        await navigator.share({ title: c.class.classType.name, text, url: classUrl });
      } catch {}
    } else {
      await navigator.clipboard.writeText(`${text}\n${classUrl}`);
      setCopiedId(c.classId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, []);

  if (friendClasses.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 font-display text-[17px] font-bold text-foreground">
        {t("classesForYou")}
      </h2>

      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 scrollbar-none">
        {friendClasses.map((c) => {
          const studioName = c.class.room?.studio?.name;
          const startDate = new Date(c.class.startsAt);
          const dayLabel = format(startDate, "EEE d 'de' MMM", { locale: es });
          const firstFriend = c.friendsGoing[0];

          return (
            <div
              key={c.classId}
              className="w-[82vw] max-w-[320px] shrink-0 snap-start"
            >
              {/* Time / day header */}
              <div className="mb-1.5 flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
                <span className="text-[13px] font-semibold capitalize text-foreground">
                  {formatTime(c.class.startsAt)} / {dayLabel}
                  <span className="font-normal text-muted"> · {c.class.classType.duration} min</span>
                </span>
              </div>

              <Link href={`/class/${c.classId}`} className="block">
                <div className="rounded-2xl border border-border/40 bg-white px-4 py-3.5 shadow-sm transition-shadow active:shadow-md">
                  <div className="flex items-center gap-3">
                    {(c.class.coach.photoUrl || c.class.coach.user?.image) ? (
                      <img
                        src={(c.class.coach.photoUrl || c.class.coach.user?.image)!}
                        alt={c.class.coach.name || "Coach"}
                        className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent/20 text-[13px] font-bold text-accent">
                        {c.class.coach.name?.charAt(0) || "C"}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold text-foreground">
                        {c.class.classType.name}
                      </p>
                      <p className="truncate text-[13px] text-muted">
                        con {c.class.coach.name?.split(" ")[0]}
                        {studioName && <span className="text-muted/50"> · {studioName}</span>}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.preventDefault(); handleShare(c); }}
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface text-muted transition-colors active:scale-95"
                    >
                      {copiedId === c.classId ? (
                        <Check className="h-3 w-3 text-green-600" />
                      ) : (
                        <Share className="h-3 w-3" />
                      )}
                    </button>
                  </div>

                  {/* Friends going + CTA */}
                  <div className="mt-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-1.5">
                        {c.friendsGoing.slice(0, 4).map((f) => (
                          <Avatar key={f.id} className="h-5 w-5 ring-2 ring-white">
                            {f.image && <AvatarImage src={f.image} />}
                            <AvatarFallback className="text-[8px] font-semibold">
                              {(f.name ?? "?")[0]}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                      </div>
                      <span className="text-[10px] font-medium text-accent">
                        {c.friendsGoing.length === 1
                          ? `${firstFriend.name?.split(" ")[0]} va`
                          : `${c.friendsGoing.length} amigos van`}
                      </span>
                    </div>
                    <span className="rounded-full bg-accent/10 px-3 py-1 text-[10px] font-semibold text-accent">
                      Reserva tú también
                    </span>
                  </div>
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
