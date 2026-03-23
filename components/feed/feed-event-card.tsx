"use client";

import { useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { AchievementIllustration } from "./achievement-badge";
import { LikeButton } from "./like-button";
import { CommentsSheet } from "./comments-sheet";
import { MediaGallery } from "./media-gallery";
import { PhotoUpload } from "./photo-upload";
import { cn } from "@/lib/utils";

interface Attendee {
  id: string;
  name: string;
  image: string | null;
}

interface MediaItem {
  id: string;
  url: string;
  thumbnailUrl?: string | null;
  mimeType: string;
}

interface FeedItem {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
  photos: MediaItem[];
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
  const shown = attendees.slice(0, 8);
  const extra = attendees.length - shown.length;

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-1.5">
        {shown.map((a) => (
          <Avatar
            key={a.id}
            className="h-6 w-6 border-[1.5px] border-white"
          >
            {a.image && <AvatarImage src={a.image} />}
            <AvatarFallback className="text-[8px] font-medium">
              {a.name?.charAt(0)}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      <span className="text-[12px] text-muted">
        {attendees.length === 1
          ? attendees[0].name
          : `${attendees.length} asistentes`}
        {extra > 0 && ` +${extra} más`}
      </span>
    </div>
  );
}

function ClassCompletedCard({ event }: FeedEventCardProps) {
  const p = event.payload;
  const attendees = (p.attendees as Attendee[]) ?? [];
  const [media, setMedia] = useState<MediaItem[]>(event.photos ?? []);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4">
        <Avatar className="h-10 w-10">
          {event.user.image && <AvatarImage src={event.user.image} />}
          <AvatarFallback className="text-xs font-medium">
            {event.user.name?.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug">
            <span className="font-bold text-foreground">
              {(p.className as string) ?? "Clase"}
            </span>
            <span className="text-muted">
              {" "}con {(p.coachName as string) ?? event.user.name}
            </span>
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {(p.date as string) ?? ""} · {(p.time as string) ?? ""} ·{" "}
            {(p.duration as number) ?? 50} min
          </p>
        </div>
        <span className="flex-shrink-0 text-[11px] text-muted/70">
          {timeAgo(event.createdAt)}
        </span>
      </div>

      {/* Attendees */}
      {attendees.length > 0 && (
        <div className="px-4">
          <AttendeesRow attendees={attendees} />
        </div>
      )}

      {/* Media gallery */}
      {media.length > 0 && (
        <div className="px-4">
          <MediaGallery media={media} />
        </div>
      )}

      {/* Actions bar */}
      <div className="flex items-center gap-1 border-t border-border/30 px-2 pt-1 pb-1">
        <LikeButton
          eventId={event.id}
          initialLiked={event.liked}
          initialCount={event.likeCount}
        />
        <CommentsSheet eventId={event.id} commentCount={event.commentCount} />
        <PhotoUpload
          eventId={event.id}
          onUploaded={(photo) =>
            setMedia((prev) => [...prev, { ...photo, thumbnailUrl: null }])
          }
        />
      </div>
    </div>
  );
}

function AchievementCard({ event }: FeedEventCardProps) {
  const p = event.payload;
  const users = (p.users as Attendee[]) ?? [
    { id: event.user.id, name: event.user.name ?? "Miembro", image: event.user.image },
  ];
  const isSingle = users.length === 1;

  function formatNames(list: Attendee[]) {
    const names = list.map((u) => u.name?.split(" ")[0] ?? "Alguien");
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} y ${names[1]}`;
    return `${names[0]}, ${names[1]} y ${names.length - 2} más`;
  }

  return (
    <div className="space-y-3">
      {/* Header with avatars */}
      <div className="flex items-start gap-3 px-4 pt-4">
        {isSingle ? (
          <Avatar className="h-10 w-10">
            {users[0].image && <AvatarImage src={users[0].image} />}
            <AvatarFallback className="text-xs font-medium">
              {users[0].name?.charAt(0)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="flex -space-x-2">
            {users.slice(0, 3).map((u) => (
              <Avatar
                key={u.id}
                className="h-9 w-9 border-2 border-white"
              >
                {u.image && <AvatarImage src={u.image} />}
                <AvatarFallback className="text-[9px] font-medium">
                  {u.name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug">
            <span className="font-bold text-foreground">
              {formatNames(users)}
            </span>
            <span className="text-muted">
              {isSingle ? " desbloqueó un logro" : " desbloquearon un logro"}
            </span>
          </p>
          <span className="text-[11px] text-muted/70">
            {timeAgo(event.createdAt)}
          </span>
        </div>
      </div>

      {/* Achievement illustration */}
      <div className="px-4">
        <AchievementIllustration
          type={(p.achievementType as string) ?? "FIRST_CLASS"}
        />
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-1 border-t border-border/30 px-2 pt-1 pb-1">
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
    <article className="overflow-hidden rounded-2xl border border-border/50 bg-white shadow-warm-sm transition-shadow hover:shadow-warm">
      {isAchievement ? (
        <AchievementCard event={event} />
      ) : (
        <ClassCompletedCard event={event} />
      )}
    </article>
  );
}
