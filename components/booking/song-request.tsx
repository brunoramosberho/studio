"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Music, Check } from "lucide-react";
import { useBranding } from "@/components/branding-provider";
import { useTranslations } from "next-intl";
import { SpotifyTrackPicker, type SpotifyTrack } from "@/components/shared/spotify-track-picker";

interface SongRequestProps {
  classId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export function SongRequest({ classId, onComplete, onSkip }: SongRequestProps) {
  const { colorAccent: accent } = useBranding();
  const t = useTranslations("songRequest");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleConfirm = async (selected: SpotifyTrack) => {
    setSubmitting(true);
    try {
      await fetch(`/api/classes/${classId}/song-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selected.name,
          artist: selected.artist,
          spotifyTrackId: selected.trackId,
          albumArt: selected.albumArt,
          previewUrl: selected.previewUrl,
        }),
      });
      setDone(true);
      setTimeout(onComplete, 1500);
    } catch {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center px-4 py-8 text-center"
      >
        <motion.div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accent}15` }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
        >
          <Check className="h-8 w-8" style={{ color: accent }} strokeWidth={2.5} />
        </motion.div>
        <p className="mt-4 font-display text-lg font-bold text-foreground">
          {t("songSuggested")}
        </p>
        <p className="mt-1 text-sm text-muted">
          {t("addedToFavorites")}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col px-4 py-6"
    >
      <div className="mb-5 flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accent}15` }}
        >
          <Music className="h-5 w-5" style={{ color: accent }} />
        </div>
        <div>
          <h3 className="font-display text-lg font-bold text-foreground">
            {t("wantToHear")}
          </h3>
          <p className="text-[13px] text-muted">
            {t("suggestSong")}
          </p>
          <p className="mt-2 max-w-[280px] text-[11px] leading-snug text-muted/85">
            {t("disclaimer")}
          </p>
        </div>
      </div>

      <SpotifyTrackPicker
        onConfirm={handleConfirm}
        isSubmitting={submitting}
        confirmLabel={t("suggestButton")}
        skipLabel={t("skip")}
        searchPlaceholder={t("searchPlaceholder")}
        onSkip={onSkip}
      />
    </motion.div>
  );
}
