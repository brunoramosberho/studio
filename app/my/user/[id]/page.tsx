"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  UserPlus,
  Check,
  Loader2,
  Calendar,
  Users,
  Clock,
  ArrowRight,
  Dumbbell,
  Heart,
  MessageCircle,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/shared/page-transition";
import { cn } from "@/lib/utils";

interface UpcomingClass {
  id: string;
  className: string;
  color: string;
  duration: number;
  coachName?: string;
  startsAt: string;
  endsAt: string;
  studioName: string;
  spotsLeft: number;
  currentUserBooked: boolean;
}

interface ActivityItem {
  id: string;
  className: string;
  color: string;
  coachName: string;
  date: string;
}

interface FeedItem {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  photos: { id: string; url: string; thumbnailUrl?: string | null; mimeType: string }[];
}

interface UserProfile {
  id: string;
  name: string | null;
  image: string | null;
  role: string;
  memberSince: string;
  friendCount: number;
  sharedClassCount: number;
  friendshipStatus: string | null;
  friendshipId: string | null;
  pendingFromMe: boolean;
  isFriend: boolean;
  isCoach: boolean;
  coachBio?: string | null;
  coachSpecialties?: string[];
  coachClasses?: UpcomingClass[];
  upcomingClasses?: UpcomingClass[];
  recentActivity?: ActivityItem[];
  activityFeed?: FeedItem[];
}

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, delay: i * 0.07, ease: "easeOut" as const },
  }),
};

function formatMemberSince(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

function formatClassDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
}

function formatClassTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("es-ES", { hour: "numeric", minute: "2-digit", hour12: true });
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function ClassCard({ cls, showCoach = true }: { cls: UpcomingClass; showCoach?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-white px-4 py-3">
      <div
        className="h-10 w-10 shrink-0 rounded-xl"
        style={{ backgroundColor: cls.color + "20" }}
      >
        <div className="flex h-full items-center justify-center">
          <Dumbbell className="h-4 w-4" style={{ color: cls.color }} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-foreground">{cls.className}</p>
        <p className="text-[12px] text-muted">
          {showCoach && cls.coachName ? `${cls.coachName} · ` : ""}
          {formatClassDate(cls.startsAt)} · {formatClassTime(cls.startsAt)}
        </p>
        <p className="text-[11px] text-muted/70">{cls.studioName}</p>
      </div>
      <div className="shrink-0 text-right">
        {cls.currentUserBooked ? (
          <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
            Inscrito/a
          </span>
        ) : cls.spotsLeft > 0 ? (
          <Link href={`/class/${cls.id}`}>
            <Button size="sm" className="h-8 gap-1.5 text-[12px]">
              Reservar
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        ) : (
          <span className="text-[11px] text-muted">Lleno</span>
        )}
      </div>
    </div>
  );
}

function FeedEventMini({ event }: { event: FeedItem }) {
  const p = event.payload;

  function getDescription() {
    switch (event.eventType) {
      case "CLASS_COMPLETED":
        return `Completó ${(p.className as string) ?? "una clase"}`;
      case "CLASS_RESERVED":
        return `Reservó ${(p.className as string) ?? "una clase"}`;
      case "ACHIEVEMENT_UNLOCKED":
        return "Desbloqueó un logro";
      default:
        return "Actividad";
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-xl bg-white px-3 py-2.5">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface">
        {event.eventType === "ACHIEVEMENT_UNLOCKED" ? (
          <span className="text-sm">🏆</span>
        ) : (
          <Dumbbell className="h-3.5 w-3.5 text-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-foreground">{getDescription()}</p>
        <p className="text-[11px] text-muted">{timeAgo(event.createdAt)}</p>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted">
        {event.likeCount > 0 && (
          <span className="flex items-center gap-0.5">
            <Heart className="h-3 w-3" /> {event.likeCount}
          </span>
        )}
        {event.commentCount > 0 && (
          <span className="flex items-center gap-0.5">
            <MessageCircle className="h-3 w-3" /> {event.commentCount}
          </span>
        )}
      </div>
    </div>
  );
}

export default function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"upcoming" | "activity">("upcoming");

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["user-profile", id],
    queryFn: async () => {
      const res = await fetch(`/api/users/${id}/profile`);
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
  });

  const sendRequestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: id }),
      });
      if (!res.ok && res.status !== 409) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile", id] });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.friendshipId) return;
      const res = await fetch(`/api/friends/${profile.friendshipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile", id] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  if (!profile) {
    return (
      <PageTransition>
        <div className="py-20 text-center">
          <p className="text-muted">No se encontró el perfil</p>
          <Button variant="ghost" className="mt-4" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver
          </Button>
        </div>
      </PageTransition>
    );
  }

  const initials = (profile.name ?? "")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const showAddFriend = !profile.isFriend && !profile.pendingFromMe && profile.friendshipStatus !== "PENDING";
  const showPendingSent = profile.pendingFromMe;
  const showAcceptRequest = profile.friendshipStatus === "PENDING" && !profile.pendingFromMe;

  return (
    <PageTransition>
      <div className="mx-auto max-w-xl space-y-5 pb-24">
        {/* Header nav */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted active:bg-surface"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-display text-lg font-bold text-foreground">Perfil</h1>
        </div>

        {/* Profile header */}
        <motion.div
          className="flex flex-col items-center text-center"
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="show"
        >
          <Avatar className="h-20 w-20">
            {profile.image && <AvatarImage src={profile.image} />}
            <AvatarFallback className="text-xl">{initials}</AvatarFallback>
          </Avatar>
          <h2 className="mt-3 font-display text-xl font-bold text-foreground">
            {profile.name}
          </h2>
          {profile.isCoach && (
            <span className="mt-1 rounded-full bg-accent/10 px-3 py-0.5 text-[12px] font-semibold text-accent">
              Coach
            </span>
          )}
          <p className="mt-1.5 text-[13px] text-muted">
            Miembro desde {formatMemberSince(profile.memberSince)}
          </p>
        </motion.div>

        {/* Stats row */}
        <motion.div
          className="flex justify-center gap-8"
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="show"
        >
          <div className="text-center">
            <p className="font-display text-lg font-bold text-foreground">{profile.friendCount}</p>
            <p className="text-[12px] text-muted">Amigos</p>
          </div>
          <div className="text-center">
            <p className="font-display text-lg font-bold text-foreground">{profile.sharedClassCount}</p>
            <p className="text-[12px] text-muted">Clases juntos</p>
          </div>
        </motion.div>

        {/* Friendship CTA */}
        <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show">
          {showAddFriend && (
            <Button
              className="w-full gap-2"
              onClick={() => sendRequestMutation.mutate()}
              disabled={sendRequestMutation.isPending}
            >
              {sendRequestMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : sendRequestMutation.isSuccess ? (
                <Check className="h-4 w-4" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {sendRequestMutation.isSuccess ? "Solicitud enviada" : "Agregar amigo"}
            </Button>
          )}
          {showPendingSent && (
            <div className="rounded-xl bg-surface px-4 py-3 text-center">
              <p className="text-[13px] font-medium text-muted">
                <Check className="mr-1.5 inline h-4 w-4 text-accent" />
                Solicitud de amistad enviada
              </p>
            </div>
          )}
          {showAcceptRequest && (
            <Button
              className="w-full gap-2"
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending}
            >
              {acceptMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Aceptar solicitud de amistad
            </Button>
          )}
        </motion.div>

        {/* ===== COACH VIEW ===== */}
        {profile.isCoach && (
          <motion.div className="space-y-4" custom={3} variants={fadeUp} initial="hidden" animate="show">
            {profile.coachBio && (
              <p className="text-center text-[14px] leading-relaxed text-muted">
                {profile.coachBio}
              </p>
            )}
            {profile.coachSpecialties && profile.coachSpecialties.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {profile.coachSpecialties.map((s) => (
                  <span key={s} className="rounded-full bg-surface px-3 py-1 text-[12px] font-medium text-foreground">
                    {s}
                  </span>
                ))}
              </div>
            )}
            {profile.coachClasses && profile.coachClasses.length > 0 && (
              <section>
                <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-muted">
                  Próximas clases
                </h3>
                <div className="space-y-2">
                  {profile.coachClasses.map((cls) => (
                    <ClassCard key={cls.id} cls={cls} showCoach={false} />
                  ))}
                </div>
              </section>
            )}
            {(!profile.coachClasses || profile.coachClasses.length === 0) && (
              <div className="rounded-2xl border border-border/50 bg-white py-10 text-center">
                <Calendar className="mx-auto h-6 w-6 text-muted/40" />
                <p className="mt-2 text-[13px] text-muted">Sin clases próximas</p>
              </div>
            )}
          </motion.div>
        )}

        {/* ===== NON-FRIEND VIEW (non-coach) ===== */}
        {!profile.isFriend && !profile.isCoach && (
          <motion.div custom={3} variants={fadeUp} initial="hidden" animate="show">
            <div className="rounded-2xl border border-border/50 bg-white py-10 text-center">
              <Users className="mx-auto h-7 w-7 text-muted/40" />
              <p className="mt-3 text-[14px] font-medium text-foreground">
                Perfil limitado
              </p>
              <p className="mt-1 max-w-xs mx-auto text-[13px] text-muted">
                Agrega a {profile.name?.split(" ")[0]} como amigo para ver su actividad, clases y más.
              </p>
            </div>
          </motion.div>
        )}

        {/* ===== FRIEND VIEW ===== */}
        {profile.isFriend && !profile.isCoach && (
          <motion.div className="space-y-4" custom={3} variants={fadeUp} initial="hidden" animate="show">
            {/* Tabs */}
            <div className="flex gap-1 rounded-xl bg-surface p-1">
              <button
                onClick={() => setActiveTab("upcoming")}
                className={cn(
                  "flex-1 rounded-lg py-2 text-[13px] font-medium transition-all",
                  activeTab === "upcoming"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted hover:text-foreground",
                )}
              >
                <Calendar className="mr-1.5 inline h-3.5 w-3.5" />
                Próximas
              </button>
              <button
                onClick={() => setActiveTab("activity")}
                className={cn(
                  "flex-1 rounded-lg py-2 text-[13px] font-medium transition-all",
                  activeTab === "activity"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted hover:text-foreground",
                )}
              >
                <Clock className="mr-1.5 inline h-3.5 w-3.5" />
                Actividad
              </button>
            </div>

            {/* Upcoming classes tab */}
            {activeTab === "upcoming" && (
              <div className="space-y-2">
                {profile.upcomingClasses && profile.upcomingClasses.length > 0 ? (
                  profile.upcomingClasses.map((cls) => (
                    <ClassCard key={cls.id} cls={cls} />
                  ))
                ) : (
                  <div className="rounded-2xl border border-border/50 bg-white py-10 text-center">
                    <Calendar className="mx-auto h-6 w-6 text-muted/40" />
                    <p className="mt-2 text-[13px] text-muted">
                      Sin clases próximas reservadas
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Activity tab */}
            {activeTab === "activity" && (
              <div className="space-y-3">
                {/* Recent classes */}
                {profile.recentActivity && profile.recentActivity.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">
                      Clases recientes
                    </h3>
                    <div className="space-y-1">
                      {profile.recentActivity.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5"
                        >
                          <div
                            className="h-8 w-8 shrink-0 rounded-lg"
                            style={{ backgroundColor: item.color + "20" }}
                          >
                            <div className="flex h-full items-center justify-center">
                              <Dumbbell className="h-3.5 w-3.5" style={{ color: item.color }} />
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-foreground">
                              {item.className}
                            </p>
                            <p className="text-[11px] text-muted">
                              {item.coachName} · {formatClassDate(item.date)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Feed posts */}
                {profile.activityFeed && profile.activityFeed.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">
                      Posts
                    </h3>
                    <div className="space-y-1">
                      {profile.activityFeed.map((event) => (
                        <FeedEventMini key={event.id} event={event} />
                      ))}
                    </div>
                  </section>
                )}

                {(!profile.recentActivity || profile.recentActivity.length === 0) &&
                  (!profile.activityFeed || profile.activityFeed.length === 0) && (
                    <div className="rounded-2xl border border-border/50 bg-white py-10 text-center">
                      <Clock className="mx-auto h-6 w-6 text-muted/40" />
                      <p className="mt-2 text-[13px] text-muted">Sin actividad reciente</p>
                    </div>
                  )}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
