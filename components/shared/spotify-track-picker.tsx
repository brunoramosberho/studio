"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Music, Search, X, Loader2 } from "lucide-react";
import { useBranding } from "@/components/branding-provider";
import type { SpotifyTrack } from "@/lib/spotify";

export type { SpotifyTrack };

function formatDuration(ms: number) {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface SpotifyTrackPickerProps {
  onConfirm: (track: SpotifyTrack) => void | Promise<void>;
  isSubmitting?: boolean;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onSkip?: () => void;
  skipLabel?: string;
  /** Placeholder del campo de búsqueda */
  searchPlaceholder?: string;
  className?: string;
  /** Ej. limpiar mensaje de error del padre al escribir de nuevo */
  onSearchInteraction?: () => void;
}

export function SpotifyTrackPicker({
  onConfirm,
  isSubmitting = false,
  confirmLabel,
  confirmDisabled = false,
  onSkip,
  skipLabel = "Omitir",
  searchPlaceholder = "Busca una canción o artista...",
  className = "",
  onSearchInteraction,
}: SpotifyTrackPickerProps) {
  const { colorAccent: accent } = useBranding();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SpotifyTrack | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchSpotify = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const tracks = (await res.json()) as SpotifyTrack[];
        setResults(Array.isArray(tracks) ? tracks : []);
      }
    } catch {
      /* ignore */
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      onSearchInteraction?.();
      setQuery(value);
      setSelected(null);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => searchSpotify(value), 350);
    },
    [searchSpotify, onSearchInteraction],
  );

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const handleSelect = (track: SpotifyTrack) => {
    setSelected(track);
    setResults([]);
    setQuery(`${track.name} — ${track.artist}`);
  };

  const handleConfirm = async () => {
    if (!selected) return;
    try {
      await onConfirm(selected);
    } catch {
      /* errores gestionados por el padre (p. ej. react-query) */
    }
  };

  return (
    <div className={className}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-10 text-sm text-foreground outline-none transition-colors focus:border-foreground/30"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              onSearchInteraction?.();
              setQuery("");
              setResults([]);
              setSelected(null);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />
        )}
      </div>

      <AnimatePresence>
        {results.length > 0 && !selected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 max-h-[280px] overflow-y-auto rounded-xl border border-border bg-card"
          >
            {results.map((track) => (
              <button
                key={track.trackId}
                type="button"
                onClick={() => handleSelect(track)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/5 active:bg-accent/10"
              >
                {track.albumArt ? (
                  <img
                    src={track.albumArt}
                    alt={track.album}
                    className="h-11 w-11 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                    <Music className="h-5 w-5 text-muted" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{track.name}</p>
                  <p className="truncate text-xs text-muted">
                    {track.artist} · {formatDuration(track.durationMs)}
                  </p>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-card p-3"
          >
            {selected.albumArt ? (
              <img
                src={selected.albumArt}
                alt={selected.album}
                className="h-14 w-14 shrink-0 rounded-lg object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                <Music className="h-6 w-6 text-muted" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{selected.name}</p>
              <p className="truncate text-xs text-muted">{selected.artist}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted/70">{selected.album}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                onSearchInteraction?.();
                setSelected(null);
                setQuery("");
                inputRef.current?.focus();
              }}
              className="shrink-0 rounded-full p-1.5 text-muted hover:bg-accent/10 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selected || isSubmitting || confirmDisabled}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-all disabled:opacity-40"
          style={{ backgroundColor: accent }}
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Music className="h-4 w-4" />
              {confirmLabel}
            </>
          )}
        </button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="w-full py-2 text-sm text-muted transition-colors hover:text-foreground"
          >
            {skipLabel}
          </button>
        )}
      </div>
    </div>
  );
}
