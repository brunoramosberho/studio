"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, Dumbbell, Instagram, ListMusic, Music, ChevronUp } from "lucide-react";
import { getIconComponent } from "@/components/admin/icon-picker";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { AchievementIllustration } from "./achievement-badge";
import { LikeButton } from "./like-button";
import { CommentsSheet } from "./comments-sheet";
import { MediaGallery } from "./media-gallery";
import { PhotoUpload } from "./photo-upload";
import { PeopleListSheet, type PersonItem } from "./people-list-sheet";
import { DisciplineSheet, type DisciplineData } from "./discipline-sheet";
import { cn } from "@/lib/utils";
import { feedAchievementTypeFromKey } from "@/lib/gamification/catalog";

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
  isPinned?: boolean;
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

function DisciplinePill({
  name,
  iconId,
  color,
  onTap,
}: {
  name: string;
  iconId?: string | null;
  color?: string | null;
  onTap?: () => void;
}) {
  const Icon = iconId ? getIconComponent(iconId) : null;
  const pillColor = color || "#475569";
  return (
    <button
      type="button"
      onClick={onTap}
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-opacity hover:opacity-70"
      style={{ borderColor: `${pillColor}30`, backgroundColor: `${pillColor}12`, color: pillColor }}
    >
      {Icon ? <Icon className="h-2.5 w-2.5" /> : <Dumbbell className="h-2.5 w-2.5" />}
      {name}
    </button>
  );
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

interface PlaylistTrackItem {
  id: string;
  title: string;
  artist: string;
  albumArt: string | null;
}

function ClassCompletedCard({ event, onOpenDiscipline }: FeedEventCardProps & { onOpenDiscipline?: () => void }) {
  const p = event.payload;
  const attendees = (p.attendees as Attendee[]) ?? [];
  const caption = (p.caption as string) ?? null;
  const [media, setMedia] = useState<MediaItem[]>(event.photos ?? []);
  const [showPeople, setShowPeople] = useState(false);

  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const hasPlaylist = p.hasPlaylist === true;
  const userAttended = currentUserId ? attendees.some((a) => a.id === currentUserId) : false;
  const canSeePlaylist = hasPlaylist && userAttended;

  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrackItem[]>([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);

  const handleTogglePlaylist = async () => {
    if (playlistOpen) {
      setPlaylistOpen(false);
      return;
    }
    setPlaylistOpen(true);
    if (playlistTracks.length > 0) return;
    setPlaylistLoading(true);
    try {
      const classId = p.classId as string;
      const res = await fetch(`/api/classes/${classId}/playlist`);
      if (res.ok) {
        const data = await res.json();
        setPlaylistTracks(data);
      }
    } catch { /* ignore */ }
    setPlaylistLoading(false);
  };

  const peopleList: PersonItem[] = attendees.map((a) => ({
    id: a.id,
    name: a.name,
    image: a.image,
  }));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <TappableAvatar user={event.user} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-[14px] leading-snug">
            <DisciplinePill
              name={(p.className as string) ?? "Clase"}
              iconId={p.classTypeIcon as string | null}
              color={p.classTypeColor as string | null}
              onTap={onOpenDiscipline}
            />
            <span className="text-muted">
              con{" "}
              {p.coachUserId ? (
                <Link href={`/my/user/${p.coachUserId}`} className="font-medium text-foreground/70 hover:underline">
                  {(p.coachName as string) ?? event.user.name}
                </Link>
              ) : (
                <span className="font-medium text-foreground/70">{(p.coachName as string) ?? event.user.name}</span>
              )}
            </span>
          </p>
          <p className="text-[12px] text-muted">
            {(p.date as string) ?? ""} · {(p.time as string) ?? ""}
            {event.studioName && ` · ${event.studioName}`}
          </p>
        </div>
        <span className="flex-shrink-0 text-[11px] text-muted/60">
          {timeAgo(event.createdAt)}
        </span>
      </div>

      {/* Caption */}
      {caption && (
        <p className="whitespace-pre-line px-4 pb-2 text-[14px] leading-relaxed text-foreground/90">
          {caption}
        </p>
      )}

      {/* Media — full width, edge-to-edge */}
      {media.length > 0 && (
        <MediaGallery media={media} className="rounded-none" />
      )}

      {/* Actions bar */}
      <div className="flex items-center gap-1 px-2 py-1.5">
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

      {/* Playlist (only for attendees) */}
      {canSeePlaylist && (
        <div className="px-4 pb-2">
          <button
            onClick={handleTogglePlaylist}
            className="flex w-full items-center gap-2 rounded-xl bg-green-50 px-3.5 py-2.5 text-left transition-colors hover:bg-green-100/70"
          >
            <ListMusic className="h-4 w-4 text-green-600" />
            <span className="flex-1 text-[13px] font-medium text-green-800">
              Ver playlist de la clase
            </span>
            <ChevronUp className={cn(
              "h-4 w-4 text-green-600 transition-transform",
              !playlistOpen && "rotate-180",
            )} />
          </button>
          {playlistOpen && (
            <div className="mt-2 space-y-1 rounded-xl border border-green-100 bg-white p-2">
              {playlistLoading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-green-300 border-t-green-600" />
                </div>
              ) : playlistTracks.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted">Sin canciones</p>
              ) : (
                playlistTracks.map((track, idx) => (
                  <div
                    key={track.id}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-green-50/50"
                  >
                    <span className="w-4 text-center text-[11px] font-medium text-muted/50">
                      {idx + 1}
                    </span>
                    {track.albumArt ? (
                      <img
                        src={track.albumArt}
                        alt={track.title}
                        className="h-8 w-8 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-green-50">
                        <Music className="h-3.5 w-3.5 text-green-600" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground">{track.title}</p>
                      <p className="truncate text-[11px] text-muted">{track.artist}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Attendees */}
      {attendees.length > 0 && (
        <div className="px-4 pb-3">
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
  const illustrationType =
    (p.achievementType as string) ??
    (typeof p.achievementKey === "string"
      ? feedAchievementTypeFromKey(p.achievementKey)
      : "FIRST_CLASS");
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
        <AchievementIllustration type={illustrationType} />
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

function ClassReservedCard({ event, onOpenDiscipline }: FeedEventCardProps & { onOpenDiscipline?: () => void }) {
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
          <p className="flex flex-wrap items-center gap-1 text-[14px] leading-snug">
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
                ? (isGroup ? "también reservaron" : "también reservó")
                : (isGroup ? "reservaron" : "reservó")}
            </span>
            <DisciplinePill
              name={(p.className as string) ?? "una clase"}
              iconId={p.classTypeIcon as string | null}
              color={p.classTypeColor as string | null}
              onTap={onOpenDiscipline}
            />
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {p.coachName ? (
              <>
                con{" "}
                {p.coachUserId ? (
                  <Link href={`/my/user/${p.coachUserId}`} className="font-medium text-foreground/70 hover:underline">
                    {p.coachName as string}
                  </Link>
                ) : (
                  (p.coachName as string)
                )}
              </>
            ) : ""}
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

function StudioPostCard({ event }: FeedEventCardProps) {
  const p = event.payload;
  const title = p.title as string | null;
  const body = p.body as string | null;
  const category = (p.category as string) ?? "announcement";
  const provider = (p.provider as string | null) ?? null;
  const permalink = (p.permalink as string | null) ?? null;

  const categoryStyles: Record<string, { emoji: string; bg: string }> = {
    announcement: { emoji: "📢", bg: "bg-blue-50" },
    challenge: { emoji: "🏆", bg: "bg-amber-50" },
    photo: { emoji: "📸", bg: "bg-pink-50" },
    motivation: { emoji: "✨", bg: "bg-purple-50" },
  };
  const style = categoryStyles[category] ?? categoryStyles.announcement;

  return (
    <div>
      {event.isPinned && (
        <div className="flex items-center gap-1.5 px-4 pt-2 text-[11px] font-medium text-accent">
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 16 16">
            <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z" />
          </svg>
          Publicación fijada
        </div>
      )}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", style.bg)}>
          <span className="text-lg">{style.emoji}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight text-foreground">
            {title ?? (
              category === "announcement" ? "Anuncio del estudio" :
              category === "challenge" ? "Reto del estudio" :
              category === "photo" ? "Foto del estudio" :
              "Mensaje del estudio"
            )}
          </p>
          <p className="flex items-center gap-2 text-[12px] text-muted">
            <span>{timeAgo(event.createdAt)}</span>
            {provider === "instagram" && (
              <span className="inline-flex items-center gap-1 text-muted/70">
                <Instagram className="h-3.5 w-3.5" />
                Instagram
              </span>
            )}
            {provider === "instagram" && permalink && (
              <a
                href={permalink}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-[12px] font-medium text-accent hover:underline"
              >
                Ver post
              </a>
            )}
          </p>
        </div>
      </div>

      {body && (
        <div className="px-4 pb-3">
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-foreground/90">{body}</p>
        </div>
      )}

      {event.photos.length > 0 && (
        <MediaGallery media={event.photos} className="rounded-none" />
      )}

      <div className="flex items-center gap-1 px-2 py-1.5">
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

function LevelUpCard({ event }: FeedEventCardProps) {
  const p = event.payload;
  const levelName = (p.levelName as string) ?? "Nuevo nivel";
  const icon = (p.icon as string) ?? "⭐";
  const color = (p.color as string) ?? "#6366F1";

  return (
    <div className="space-y-3 px-4 pb-4 pt-4">
      <div className="flex items-start gap-3">
        <Link href={`/my/user/${event.user.id}`} className="flex-shrink-0">
          <Avatar className="h-10 w-10 ring-2 ring-white">
            {event.user.image && <AvatarImage src={event.user.image} />}
            <AvatarFallback className="text-sm font-bold">
              {event.user.name?.charAt(0) ?? "?"}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug">
            <Link href={`/my/user/${event.user.id}`} className="font-bold text-foreground hover:underline">
              {event.user.name?.split(" ")[0] ?? "Alguien"}
            </Link>
            <span className="text-muted"> subió de nivel</span>
          </p>
          <span className="text-[11px] text-muted/70">{timeAgo(event.createdAt)}</span>
        </div>
      </div>
      <div
        className="rounded-2xl border p-4 text-center"
        style={{ borderColor: `${color}40`, backgroundColor: `${color}12` }}
      >
        <p className="text-3xl">{icon}</p>
        <p className="mt-2 font-display text-lg font-bold text-foreground">{levelName}</p>
        <p className="mt-1 text-xs text-muted">Nivel de lealtad desbloqueado</p>
      </div>
      <div className="flex items-center gap-1 border-t border-border/30 px-2 pt-1 pb-1">
        <LikeButton eventId={event.id} initialLiked={event.liked} initialCount={event.likeCount} />
        <CommentsSheet eventId={event.id} commentCount={event.commentCount} />
      </div>
    </div>
  );
}

function extractDiscipline(payload: Record<string, unknown>): DisciplineData {
  return {
    name: (payload.className as string) ?? "Clase",
    description: (payload.classTypeDescription as string) ?? null,
    color: (payload.classTypeColor as string) ?? null,
    icon: (payload.classTypeIcon as string) ?? null,
    mediaUrl: (payload.classTypeMediaUrl as string) ?? null,
    tags: (payload.classTypeTags as string[]) ?? [],
    duration: (payload.classTypeDuration as number) ?? (payload.duration as number) ?? undefined,
    level: (payload.classTypeLevel as string) ?? undefined,
  };
}

export function FeedEventCard({ event }: FeedEventCardProps) {
  const [disciplineOpen, setDisciplineOpen] = useState(false);
  const discipline = extractDiscipline(event.payload);

  const openDiscipline = () => setDisciplineOpen(true);

  return (
    <article className={cn(
      "overflow-hidden border-y border-border/40 bg-white sm:rounded-2xl sm:border sm:shadow-warm-sm",
      event.isPinned && "ring-1 ring-accent/20",
    )}>
      {event.eventType === "STUDIO_POST" ? (
        <StudioPostCard event={event} />
      ) : event.eventType === "ACHIEVEMENT_UNLOCKED" ? (
        <AchievementCard event={event} />
      ) : event.eventType === "LEVEL_UP" ? (
        <LevelUpCard event={event} />
      ) : event.eventType === "CLASS_RESERVED" ? (
        <ClassReservedCard event={event} onOpenDiscipline={openDiscipline} />
      ) : (
        <ClassCompletedCard event={event} onOpenDiscipline={openDiscipline} />
      )}

      <DisciplineSheet
        open={disciplineOpen}
        onClose={() => setDisciplineOpen(false)}
        discipline={discipline}
      />
    </article>
  );
}
