"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { AchievementIllustration } from "./achievement-badge";
import { LikeButton } from "./like-button";
import { CommentsSheet } from "./comments-sheet";
import { MediaGallery } from "./media-gallery";
import { PhotoUpload } from "./photo-upload";
import { PeopleListSheet, type PersonItem } from "./people-list-sheet";
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
  currentUserBooked?: boolean;
  reservedBy?: { id: string; name: string | null; image: string | null }[];
  studioName?: string;
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

function TappableAvatar({
  user,
  className,
}: {
  user: { id: string; name?: string | null; image?: string | null };
  className?: string;
}) {
  return (
    <Link href={`/my/user/${user.id}`} className="shrink-0">
      <Avatar className={cn("h-10 w-10", className)}>
        {user.image && <AvatarImage src={user.image} />}
        <AvatarFallback className="text-xs font-medium">
          {user.name?.charAt(0)}
        </AvatarFallback>
      </Avatar>
    </Link>
  );
}

function TappableGroupAvatars({
  users,
  onTapGroup,
  avatarSize = "h-9 w-9",
}: {
  users: { id: string; name?: string | null; image?: string | null }[];
  onTapGroup: () => void;
  avatarSize?: string;
}) {
  if (users.length === 1) {
    return (
      <TappableAvatar user={users[0]} className={avatarSize} />
    );
  }

  return (
    <button className="flex -space-x-2" onClick={onTapGroup}>
      {users.slice(0, 3).map((u) => (
        <Avatar key={u.id} className={cn(avatarSize, "border-2 border-white")}>
          {u.image && <AvatarImage src={u.image} />}
          <AvatarFallback className="text-[9px] font-medium">
            {u.name?.charAt(0)}
          </AvatarFallback>
        </Avatar>
      ))}
    </button>
  );
}

function AttendeesRow({
  attendees,
  onTap,
}: {
  attendees: Attendee[];
  onTap: () => void;
}) {
  const shown = attendees.slice(0, 8);
  const extra = attendees.length - shown.length;

  return (
    <button className="flex items-center gap-2" onClick={onTap}>
      <div className="flex -space-x-1.5">
        {shown.map((a, idx) => (
          <Avatar key={`${a.id}-${idx}`} className="h-6 w-6 border-[1.5px] border-white">
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
    </button>
  );
}

function ClassCompletedCard({ event }: FeedEventCardProps) {
  const p = event.payload;
  const attendees = (p.attendees as Attendee[]) ?? [];
  const [media, setMedia] = useState<MediaItem[]>(event.photos ?? []);
  const [showPeople, setShowPeople] = useState(false);

  const peopleList: PersonItem[] = attendees.map((a) => ({
    id: a.id,
    name: a.name,
    image: a.image,
  }));

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4">
        <TappableAvatar user={event.user} />
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
            {event.studioName && (
              <span className="text-muted/50"> · {event.studioName}</span>
            )}
          </p>
        </div>
        <span className="flex-shrink-0 text-[11px] text-muted/70">
          {timeAgo(event.createdAt)}
        </span>
      </div>

      {/* Attendees */}
      {attendees.length > 0 && (
        <div className="px-4">
          {attendees.length === 1 ? (
            <Link href={`/my/user/${attendees[0].id}`} className="inline-flex items-center gap-2">
              <Avatar className="h-6 w-6 border-[1.5px] border-white">
                {attendees[0].image && <AvatarImage src={attendees[0].image} />}
                <AvatarFallback className="text-[8px] font-medium">
                  {attendees[0].name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span className="text-[12px] text-muted">{attendees[0].name}</span>
            </Link>
          ) : (
            <AttendeesRow attendees={attendees} onTap={() => setShowPeople(true)} />
          )}
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

      <PeopleListSheet
        open={showPeople}
        onClose={() => setShowPeople(false)}
        title="Asistentes"
        people={peopleList}
      />
    </div>
  );
}

function AchievementCard({ event }: FeedEventCardProps) {
  const p = event.payload;
  const users = (p.users as Attendee[]) ?? [
    { id: event.user.id, name: event.user.name ?? "Miembro", image: event.user.image },
  ];
  const isSingle = users.length === 1;
  const [showPeople, setShowPeople] = useState(false);

  function formatNames(list: Attendee[]) {
    const names = list.map((u) => u.name?.split(" ")[0] ?? "Alguien");
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} y ${names[1]}`;
    return `${names[0]}, ${names[1]} y ${names.length - 2} más`;
  }

  const peopleList: PersonItem[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    image: u.image,
  }));

  return (
    <div className="space-y-3">
      {/* Header with avatars */}
      <div className="flex items-start gap-3 px-4 pt-4">
        <TappableGroupAvatars
          users={users}
          onTapGroup={() => setShowPeople(true)}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug">
            {isSingle ? (
              <Link href={`/my/user/${users[0].id}`} className="font-bold text-foreground hover:underline">
                {formatNames(users)}
              </Link>
            ) : (
              <button onClick={() => setShowPeople(true)} className="font-bold text-foreground text-left">
                {formatNames(users)}
              </button>
            )}
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

      <PeopleListSheet
        open={showPeople}
        onClose={() => setShowPeople(false)}
        title="Logro desbloqueado"
        people={peopleList}
      />
    </div>
  );
}

function formatReservedNames(people: { name: string | null }[]) {
  const names = people.map((p) => p.name?.split(" ")[0] ?? "Alguien");
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names[0]}, ${names[1]} y ${names.length - 2} más`;
}

function ClassReservedCard({ event }: FeedEventCardProps) {
  const p = event.payload;
  const classId = p.classId as string | undefined;
  const classDate = p.date ? new Date(p.date as string) : null;
  const isFuture = classDate ? classDate.getTime() > Date.now() : false;
  const alreadyBooked = !!event.currentUserBooked;
  const [showPeople, setShowPeople] = useState(false);

  const people = event.reservedBy && event.reservedBy.length > 0
    ? event.reservedBy
    : [event.user];
  const isGroup = people.length > 1;

  const timeStr = classDate
    ? classDate.toLocaleTimeString("es-ES", { hour: "numeric", minute: "2-digit", hour12: true })
    : null;

  const peopleList: PersonItem[] = people.map((u) => ({
    id: u.id,
    name: u.name,
    image: u.image,
  }));

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <TappableGroupAvatars
          users={people}
          onTapGroup={() => setShowPeople(true)}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug">
            {isGroup ? (
              <button onClick={() => setShowPeople(true)} className="font-bold text-foreground text-left">
                {formatReservedNames(people)}
              </button>
            ) : (
              <Link href={`/my/user/${people[0].id}`} className="font-bold text-foreground hover:underline">
                {formatReservedNames(people)}
              </Link>
            )}
            <span className="text-muted">
              {alreadyBooked
                ? (isGroup ? " también reservaron " : " también reservó ")
                : (isGroup ? " reservaron " : " reservó ")}
            </span>
            <span className="font-semibold text-foreground">
              {(p.className as string) ?? "una clase"}
            </span>
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {p.coachName ? `con ${p.coachName}` : ""}
            {classDate
              ? ` · ${classDate.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })}`
              : ""}
            {timeStr ? ` · ${timeStr}` : ""}
            {event.studioName && (
              <span className="text-muted/50"> · {event.studioName}</span>
            )}
          </p>
          <span className="text-[11px] text-muted/70">
            {timeAgo(event.createdAt)}
          </span>
        </div>
      </div>

      {isFuture && classId && !alreadyBooked && (
        <div className="px-4 pb-1">
          <Link
            href={`/class/${classId}`}
            className="group flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 transition-all hover:brightness-105 active:scale-[0.98]"
          >
            <span className="text-[13px] font-bold text-white">
              Reserva tú también
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-white transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      )}

      {alreadyBooked && isFuture && (
        <div className="mx-4 mb-1 rounded-lg bg-accent/8 px-3 py-1.5">
          <span className="text-[12px] font-medium text-accent">
            Ya estás en esta clase
          </span>
        </div>
      )}

      <div className="flex items-center gap-1 border-t border-border/30 px-2 pt-1 pb-1">
        <LikeButton
          eventId={event.id}
          initialLiked={event.liked}
          initialCount={event.likeCount}
        />
        <CommentsSheet eventId={event.id} commentCount={event.commentCount} />
      </div>

      <PeopleListSheet
        open={showPeople}
        onClose={() => setShowPeople(false)}
        title="Reservaron"
        people={peopleList}
      />
    </div>
  );
}

export function FeedEventCard({ event }: FeedEventCardProps) {
  return (
    <article className="overflow-hidden rounded-2xl border border-border/50 bg-white shadow-warm-sm transition-shadow hover:shadow-warm">
      {event.eventType === "ACHIEVEMENT_UNLOCKED" ? (
        <AchievementCard event={event} />
      ) : event.eventType === "CLASS_RESERVED" ? (
        <ClassReservedCard event={event} />
      ) : (
        <ClassCompletedCard event={event} />
      )}
    </article>
  );
}
