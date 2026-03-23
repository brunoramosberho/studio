"use client";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { AchievementBadge } from "./achievement-badge";
import { LikeButton } from "./like-button";
import { CommentsSheet } from "./comments-sheet";
import { cn } from "@/lib/utils";

interface Attendee {
  id: string;
  name: string;
  image: string | null;
}

interface FeedItem {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
  likeCount: number;
  commentCount: number;
  liked: boolean;
}

interface FeedEventCardProps {
  event: FeedItem;
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
  return new Date(dateStr).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

function AttendeesRow({ attendees }: { attendees: Attendee[] }) {
  const shown = attendees.slice(0, 6);
  const extra = attendees.length - shown.length;

  return (
    <div className="flex items-center gap-1">
      <div className="flex -space-x-2">
        {shown.map((a) => (
          <Avatar key={a.id} className="h-7 w-7 border-2 border-background">
            {a.image && <AvatarImage src={a.image} />}
            <AvatarFallback className="text-[9px]">
              {a.name?.charAt(0)}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      <span className="ml-1 text-[12px] text-muted">
        {attendees.length === 1
          ? attendees[0].name
          : `${attendees.length} asistentes`}
        {extra > 0 && ` +${extra}`}
      </span>
    </div>
  );
}

function ClassCompletedCard({ event }: FeedEventCardProps) {
  const p = event.payload;
  const attendees = (p.attendees as Attendee[]) ?? [];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9">
          {event.user.image && <AvatarImage src={event.user.image} />}
          <AvatarFallback className="text-xs">
            {event.user.name?.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <p className="text-[14px] leading-snug">
            <span className="font-semibold text-foreground">
              {(p.className as string) ?? "Clase"}
            </span>
            <span className="text-muted">
              {" "}
              con {(p.coachName as string) ?? event.user.name}
            </span>
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {(p.date as string) ?? ""} · {(p.time as string) ?? ""} ·{" "}
            {(p.duration as number) ?? 50} min
          </p>
        </div>
        <span className="text-[11px] text-muted">{timeAgo(event.createdAt)}</span>
      </div>

      {/* Attendees */}
      {attendees.length > 0 && <AttendeesRow attendees={attendees} />}

      {/* Actions */}
      <div className="flex items-center gap-1 border-t border-border/40 pt-2">
        <LikeButton
          eventId={event.id}
          initialLiked={event.liked}
          initialCount={event.likeCount}
        />
        <CommentsSheet eventId={event.id} commentCount={event.commentCount} />
      </div>
    </div>
  );
}

function AchievementCard({ event }: FeedEventCardProps) {
  const p = event.payload;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9">
          {event.user.image && <AvatarImage src={event.user.image} />}
          <AvatarFallback className="text-xs">
            {event.user.name?.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <p className="text-[14px] leading-snug">
            <span className="font-semibold text-foreground">
              {event.user.name?.split(" ")[0]}
            </span>
            <span className="text-muted"> desbloqueó un logro</span>
          </p>
          <div className="mt-2">
            <AchievementBadge
              type={(p.achievementType as string) ?? "FIRST_CLASS"}
              size="md"
            />
          </div>
          <p className="mt-1.5 text-[12px] text-muted">
            {(p.description as string) ?? ""}
          </p>
        </div>
        <span className="text-[11px] text-muted">{timeAgo(event.createdAt)}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 border-t border-border/40 pt-2">
        <LikeButton
          eventId={event.id}
          initialLiked={event.liked}
          initialCount={event.likeCount}
          isAchievement
        />
        <CommentsSheet eventId={event.id} commentCount={event.commentCount} />
      </div>
    </div>
  );
}

export function FeedEventCard({ event }: FeedEventCardProps) {
  const isAchievement = event.eventType === "ACHIEVEMENT_UNLOCKED";

  return (
    <article
      className={cn(
        "rounded-2xl border bg-white p-4 shadow-warm-sm transition-shadow hover:shadow-warm",
        "animate-fade-in",
      )}
    >
      {isAchievement ? (
        <AchievementCard event={event} />
      ) : (
        <ClassCompletedCard event={event} />
      )}
    </article>
  );
}
