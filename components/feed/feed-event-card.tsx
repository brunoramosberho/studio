"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, Dumbbell, Instagram, ListMusic, Lock, Music, ChevronUp } from "lucide-react";
import { useBranding } from "@/components/branding-provider";
import { getIconComponent } from "@/components/admin/icon-picker";
import { UserAvatar, type UserAvatarUser } from "@/components/ui/user-avatar";
import { AchievementIllustration } from "./achievement-badge";
import { HexBadge } from "@/components/profile/level-hex-card";
import { LikeButton } from "./like-button";
import { CommentsSheet } from "./comments-sheet";
import { MediaGallery } from "./media-gallery";
import { PhotoUpload } from "./photo-upload";
import { PollCard, type PollData } from "./poll-card";
import { PeopleListSheet, type PersonItem } from "./people-list-sheet";
import { DisciplineSheet, type DisciplineData } from "./discipline-sheet";
import { cn, maskLastName } from "@/lib/utils";
import { feedAchievementTypeFromKey } from "@/lib/gamification/catalog";
import { getLoyaltyTierVisual } from "@/lib/loyalty-tier";
import { FriendBiometrics } from "@/components/booking/friend-biometrics";

interface Attendee {
  id: string;
  name: string;
  image: string | null;
  hasActiveMembership?: boolean;
  level?: string | null;
}

interface MediaItem {
  id: string;
  url: string;
  thumbnailUrl?: string | null;
  mimeType: string;
  userId?: string;
}

interface FeedItem {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null; hasActiveMembership?: boolean; level?: string | null };
  photos: MediaItem[];
  polls?: PollData[];
  likeCount: number;
  commentCount: number;
  liked: boolean;
  isPinned?: boolean;
  currentUserBooked?: boolean;
  reservedBy?: { id: string; name: string | null; image: string | null; hasActiveMembership?: boolean; level?: string | null }[];
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
  size = 40,
}: {
  user: { id: string; name?: string | null; image?: string | null; hasActiveMembership?: boolean; level?: string | null };
  size?: number;
}) {
  return (
    <Link href={`/my/user/${user.id}`} className="shrink-0">
      <UserAvatar
        user={user as UserAvatarUser}
        size={size}
      />
    </Link>
  );
}

function TappableGroupAvatars({
  users,
  onTapGroup,
  size = 36,
}: {
  users: { id: string; name?: string | null; image?: string | null; hasActiveMembership?: boolean; level?: string | null }[];
  onTapGroup: () => void;
  size?: number;
}) {
  if (users.length === 1) {
    return <TappableAvatar user={users[0]} size={size} />;
  }

  return (
    <button className="flex -space-x-2" onClick={onTapGroup}>
      {users.slice(0, 3).map((u) => (
        <UserAvatar
          key={u.id}
          user={u as UserAvatarUser}
          size={size}
          showBadge={false}
        />
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
          <UserAvatar
            key={`${a.id}-${idx}`}
            user={a as UserAvatarUser}
            size={24}
            showBadge={false}
          />
        ))}
      </div>
      <span className="text-[12px] text-muted">
        {attendees.length === 1
          ? maskLastName(attendees[0].name)
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
        <TappableAvatar user={{ ...event.user, image: (p.coachImage as string) || event.user.image }} />
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
        <MediaGallery
          media={media}
          className="rounded-none"
          eventId={event.id}
          currentUserId={currentUserId}
          coachUserId={p.coachUserId as string | undefined}
          onPhotoDeleted={(photoId) => setMedia((prev) => prev.filter((m) => m.id !== photoId))}
        />
      )}

      {/* Actions bar */}
      <div className="flex items-center gap-1 px-2 py-1.5">
        <LikeButton
          eventId={event.id}
          initialLiked={event.liked}
          initialCount={event.likeCount}
        />
        <CommentsSheet eventId={event.id} commentCount={event.commentCount} />
        {userAttended && (
          <PhotoUpload
            eventId={event.id}
            onUploaded={(photo) =>
              setMedia((prev) => [...prev, { ...photo, thumbnailUrl: null }])
            }
          />
        )}
      </div>

      {/* Playlist — locked hint for non-attendees, full for attendees */}
      {hasPlaylist && !userAttended && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2.5 rounded-[10px] border border-neutral-200/50 bg-neutral-50/40 px-3 py-2 opacity-70">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-300">
              <Lock className="h-3 w-3 text-white" />
            </div>
            <span className="flex-1 text-[13px] font-medium text-neutral-400">
              Playlist disponible para asistentes
            </span>
          </div>
        </div>
      )}
      {canSeePlaylist && (
        <div className="px-4 pb-2">
          <button
            onClick={handleTogglePlaylist}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[10px] border px-3 py-2 text-left transition-all active:scale-[0.98]",
              playlistOpen
                ? "border-neutral-200 bg-neutral-50"
                : "border-neutral-200/70 bg-neutral-50/60 hover:bg-neutral-100/60",
            )}
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500">
              <ListMusic className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="flex-1 text-[13px] font-semibold text-foreground/85">
              Playlist de la clase
            </span>
            <ChevronUp className={cn(
              "h-4 w-4 text-neutral-400 transition-transform duration-200",
              !playlistOpen && "rotate-180",
            )} />
          </button>
          {playlistOpen && (
            <div className="mt-1.5 overflow-hidden rounded-[10px] border border-neutral-200/80 bg-white">
              {playlistLoading ? (
                <div className="flex items-center justify-center py-6">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-200 border-t-emerald-500" />
                </div>
              ) : playlistTracks.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted">Sin canciones</p>
              ) : (
                playlistTracks.map((track, idx) => (
                  <div
                    key={track.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 transition-colors hover:bg-neutral-50/80",
                      idx > 0 && "border-t border-neutral-100/70",
                    )}
                  >
                    <span className="w-4 text-right text-[12px] tabular-nums text-neutral-400">
                      {idx + 1}
                    </span>
                    {track.albumArt ? (
                      <img
                        src={track.albumArt}
                        alt={track.title}
                        className="h-10 w-10 shrink-0 rounded-[5px] object-cover shadow-sm"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[5px] bg-neutral-100">
                        <Music className="h-4 w-4 text-neutral-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold leading-tight text-foreground/90">{track.title}</p>
                      <p className="truncate text-[12px] leading-tight text-neutral-500">{track.artist}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Biometrics (self + friends) */}
      {(p.classId as string) && (
        <div className="px-4 pb-2">
          <FriendBiometrics classId={p.classId as string} />
        </div>
      )}

      {/* Attendees */}
      {attendees.length > 0 && (
        <div className="px-4 pb-3">
          {attendees.length === 1 ? (
            <Link href={`/my/user/${attendees[0].id}`} className="inline-flex items-center gap-2">
              <UserAvatar
                user={attendees[0] as UserAvatarUser}
                size={24}
                showBadge={false}
              />
              <span className="text-[12px] text-muted">{maskLastName(attendees[0].name)}</span>
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

interface AchievementEntry {
  achievementKey: string;
  achievementType: string;
  label: string;
  description: string;
  icon: string;
}

function AchievementCard({ event }: FeedEventCardProps) {
  const p = event.payload;
  const rawAchievements = p.achievements as AchievementEntry[] | undefined;

  const achievements: AchievementEntry[] =
    rawAchievements && rawAchievements.length > 0
      ? rawAchievements
      : [
          {
            achievementKey: (p.achievementKey as string) ?? "",
            achievementType:
              (p.achievementType as string) ??
              (typeof p.achievementKey === "string"
                ? feedAchievementTypeFromKey(p.achievementKey)
                : "FIRST_CLASS"),
            label: (p.label as string) ?? "",
            description: (p.description as string) ?? "",
            icon: (p.icon as string) ?? "🏆",
          },
        ];

  const users = (p.users as Attendee[]) ?? [
    { id: event.user.id, name: event.user.name ?? "Miembro", image: event.user.image },
  ];
  const isSingleUser = users.length === 1;
  const isMultiAchievement = achievements.length > 1;
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
      <div className="flex items-start gap-3 px-4 pt-4">
        <TappableGroupAvatars
          users={users}
          onTapGroup={() => setShowPeople(true)}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug">
            {isSingleUser ? (
              <Link href={`/my/user/${users[0].id}`} className="font-bold text-foreground hover:underline">
                {formatNames(users)}
              </Link>
            ) : (
              <button onClick={() => setShowPeople(true)} className="font-bold text-foreground text-left">
                {formatNames(users)}
              </button>
            )}
            <span className="text-muted">
              {isMultiAchievement
                ? ` desbloqueó ${achievements.length} logros`
                : isSingleUser
                  ? " desbloqueó un logro"
                  : " desbloquearon un logro"}
            </span>
          </p>
          <span className="text-[11px] text-muted/70">
            {timeAgo(event.createdAt)}
          </span>
        </div>
      </div>

      {isMultiAchievement ? (
        <div className="grid grid-cols-2 gap-2 px-4">
          {achievements.map((ach) => (
            <AchievementIllustration
              key={ach.achievementKey}
              type={ach.achievementType}
              compact
            />
          ))}
        </div>
      ) : (
        <div className="px-4">
          <AchievementIllustration type={achievements[0].achievementType} />
        </div>
      )}

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

function ClassPromoBlock({ payload }: { payload: Record<string, unknown> }) {
  const classId = payload.linkedClassId as string;
  const className = (payload.className as string) ?? "Clase";
  const classTypeIcon = payload.classTypeIcon as string | null;
  const classTypeColor = (payload.classTypeColor as string) ?? "#6366f1";
  const coachName = payload.coachName as string | null;
  const coachImage = payload.coachImage as string | null;
  const coachUserId = payload.coachUserId as string | null;
  const classStartsAt = payload.classStartsAt ? new Date(payload.classStartsAt as string) : null;
  const roomName = payload.roomName as string | null;
  const studioName = payload.studioName as string | null;

  const isFuture = classStartsAt ? classStartsAt.getTime() > Date.now() : false;
  const Icon = classTypeIcon ? getIconComponent(classTypeIcon) : null;

  if (!isFuture) return null;

  const dateStr = classStartsAt
    ? classStartsAt.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })
    : "";
  const timeStr = classStartsAt
    ? classStartsAt.toLocaleTimeString("es-ES", { hour: "numeric", minute: "2-digit", hour12: true })
    : "";

  return (
    <div className="mx-4 mb-3">
      <div
        className="overflow-hidden rounded-2xl border"
        style={{ borderColor: `${classTypeColor}25`, backgroundColor: `${classTypeColor}06` }}
      >
        <div className="flex items-center gap-3 p-3.5">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${classTypeColor}15` }}
          >
            {Icon ? (
              <Icon className="h-6 w-6" style={{ color: classTypeColor }} />
            ) : (
              <Dumbbell className="h-6 w-6" style={{ color: classTypeColor }} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-foreground">{className}</p>
            {coachName && (
              <p className="text-[12px] text-muted">
                con{" "}
                {coachUserId ? (
                  <Link href={`/my/user/${coachUserId}`} className="font-medium text-foreground/70 hover:underline">
                    {coachName}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground/70">{coachName}</span>
                )}
              </p>
            )}
            <p className="mt-0.5 text-[11px] text-muted/70">
              {dateStr}{timeStr ? ` · ${timeStr}` : ""}
              {roomName && <span> · {roomName}</span>}
              {studioName && <span className="text-muted/50"> · {studioName}</span>}
            </p>
          </div>
          {coachImage && (
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full">
              <img src={coachImage} alt={coachName ?? ""} className="h-full w-full object-cover" />
            </div>
          )}
        </div>

        <Link
          href={`/class/${classId}`}
          className="group flex items-center justify-center gap-2 border-t px-4 py-2.5 transition-colors hover:brightness-105"
          style={{ borderColor: `${classTypeColor}20`, backgroundColor: classTypeColor }}
        >
          <span className="text-[13px] font-bold text-white">
            Reservar clase
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-white transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

function StudioPostCard({ event }: FeedEventCardProps) {
  const p = event.payload;
  const { studioName, appIconUrl } = useBranding();
  const title = p.title as string | null;
  const body = p.body as string | null;
  const provider = (p.provider as string | null) ?? null;
  const permalink = (p.permalink as string | null) ?? null;
  const authorName = (p.authorName as string) ?? studioName;
  const authorImage = (p.authorImage as string | null) ?? appIconUrl;
  const hasLinkedClass = !!p.linkedClassId;

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
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full">
          {authorImage ? (
            <img src={authorImage} alt={authorName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-accent/10">
              <span className="text-sm font-bold text-accent">{authorName?.charAt(0) ?? "S"}</span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight text-foreground">
            {authorName}
          </p>
          <p className="flex items-center gap-2 text-[12px] text-muted">
            {title && (
              <>
                <span>{title}</span>
                <span className="text-muted/40">·</span>
              </>
            )}
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

      {event.polls && event.polls.length > 0 && (
        <div className={cn(event.photos.length > 0 ? "mt-3" : "")}>
          {event.polls.map((poll) => (
            <PollCard key={poll.id} poll={poll} eventId={event.id} />
          ))}
        </div>
      )}

      {hasLinkedClass && <ClassPromoBlock payload={p} />}

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
  const { coachIconSvg } = useBranding();
  const tier = getLoyaltyTierVisual(levelName);

  return (
    <div className="space-y-3 px-4 pb-4 pt-4">
      <div className="flex items-start gap-3">
        <Link href={`/my/user/${event.user.id}`} className="flex-shrink-0">
          <UserAvatar user={event.user as UserAvatarUser} size={40} />
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
      <div className="flex flex-col items-center gap-1 py-3">
        <HexBadge tier={tier} size={64} coachIconSvg={coachIconSvg} active />
        <p className="mt-1 font-display text-lg font-bold text-foreground">{levelName}</p>
        <p className="text-xs text-muted">Nivel de lealtad desbloqueado</p>
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
