"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Check, Music, Trash2, ListMusic, ChevronDown, Wand2 } from "lucide-react";
import {
  SpotifyTrackPicker,
  type SpotifyTrack,
} from "@/components/shared/spotify-track-picker";
import { PhotoUpload } from "./photo-upload";
import { cn } from "@/lib/utils";

interface PlaylistTrack {
  id: string;
  title: string;
  artist: string;
  albumArt: string | null;
}

interface UploadedPhoto {
  id: string;
  url: string;
  mimeType: string;
  userId?: string;
}

/**
 * Inline editing panel shown on a class feed post to the instructor who taught
 * it — so they can add photos, write the caption, and manage the playlist
 * without leaving for the coach portal. All three APIs already authorize the
 * coach via their member session (the class post is authored by the coach, and
 * the playlist routes check cls.coach.userId), so this is purely client-side.
 */
export function InstructorPostTools({
  eventId,
  classId,
  initialCaption,
  onPhotoUploaded,
}: {
  eventId: string;
  classId: string;
  initialCaption: string;
  onPhotoUploaded: (photo: UploadedPhoto) => void;
}) {
  const t = useTranslations("feed");
  const [open, setOpen] = useState(false);

  // ── Caption (debounced auto-save) ──
  const [caption, setCaption] = useState(initialCaption);
  const [saved, setSaved] = useState(false);
  const timer = useRef<NodeJS.Timeout>(undefined);

  const onCaptionChange = (value: string) => {
    setCaption(value);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await fetch(`/api/feed/${eventId}/caption`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caption: value.trim() }),
        });
        setSaved(true);
      } catch {
        /* ignore — they can retry */
      }
    }, 800);
  };

  // ── Playlist ──
  const { data: tracks = [], refetch } = useQuery<PlaylistTrack[]>({
    queryKey: ["instructor-playlist", classId],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${classId}/playlist`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  const addTrack = useMutation({
    mutationFn: async (track: SpotifyTrack) => {
      const res = await fetch(`/api/classes/${classId}/playlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: track.name,
          artist: track.artist,
          spotifyTrackId: track.trackId,
          albumArt: track.albumArt,
          previewUrl: track.previewUrl,
        }),
      });
      if (!res.ok) throw new Error("Failed to add track");
    },
    onSuccess: () => refetch(),
  });

  const removeTrack = useMutation({
    mutationFn: async (trackId: string) => {
      await fetch(`/api/classes/${classId}/playlist?trackId=${trackId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => refetch(),
  });

  return (
    <div className="mx-4 mb-3 overflow-hidden rounded-xl border border-accent/25 bg-accent/[0.04] dark:border-accent/30 dark:bg-accent/[0.08]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <Wand2 className="h-4 w-4 text-accent" />
        <span className="flex-1 text-[13px] font-semibold text-accent">
          {t("instructorTools")}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-accent/70 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="space-y-4 px-3 pb-3">
          {/* Photos */}
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-muted">{t("photosLabel")}</p>
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2 py-1">
              <PhotoUpload eventId={eventId} onUploaded={onPhotoUploaded} />
              <span className="text-[13px] text-muted">{t("addPhotos")}</span>
            </div>
          </div>

          {/* Caption */}
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-muted">{t("captionLabel")}</p>
            <textarea
              value={caption}
              onChange={(e) => onCaptionChange(e.target.value)}
              placeholder={t("captionPlaceholder")}
              rows={2}
              className="w-full resize-none rounded-lg border border-border/60 bg-card px-3 py-2 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-accent/40"
            />
            {saved && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="h-3 w-3" /> {t("captionSaved")}
              </p>
            )}
          </div>

          {/* Playlist */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-muted">
              <ListMusic className="h-3.5 w-3.5" /> {t("classPlaylist")}
            </p>
            {tracks.length > 0 && (
              <div className="mb-2 space-y-1">
                {tracks.map((track) => (
                  <div
                    key={track.id}
                    className="flex items-center gap-2 rounded-lg border border-border/50 bg-card px-2 py-1.5"
                  >
                    {track.albumArt ? (
                      <img
                        src={track.albumArt}
                        alt={track.title}
                        className="h-9 w-9 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-surface">
                        <Music className="h-4 w-4 text-muted" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground">{track.title}</p>
                      <p className="truncate text-[12px] text-muted">{track.artist}</p>
                    </div>
                    <button
                      onClick={() => removeTrack.mutate(track.id)}
                      disabled={removeTrack.isPending}
                      aria-label={t("removeSong")}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/15 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <SpotifyTrackPicker
              addOnSelect
              onConfirm={async (track) => {
                await addTrack.mutateAsync(track);
              }}
              isSubmitting={addTrack.isPending}
              confirmLabel={t("addToPlaylist")}
              searchPlaceholder={t("searchSong")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
