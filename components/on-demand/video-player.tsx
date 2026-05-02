"use client";

import { useEffect, useRef, useState } from "react";
import { useBranding } from "@/components/branding-provider";

interface PlaybackResponse {
  sessionId: string;
  token: string;
  expiresAt: string;
  videoUid: string;
}

interface OnDemandVideoPlayerProps {
  videoId: string;
  title: string;
  poster?: string | null;
  coachName?: string | null;
  onSuperseded?: () => void;
}

const HEARTBEAT_INTERVAL_MS = 30_000;

export function OnDemandVideoPlayer({
  videoId,
  title,
  poster,
  coachName,
  onSuperseded,
}: OnDemandVideoPlayerProps) {
  const { colorAccent } = useBranding();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [playback, setPlayback] = useState<PlaybackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supersededState, setSupersededState] = useState(false);
  const [lastVideoId, setLastVideoId] = useState(videoId);

  // Reset state during render when the videoId changes (React 19 idiom).
  if (videoId !== lastVideoId) {
    setLastVideoId(videoId);
    setError(null);
    setSupersededState(false);
    setPlayback(null);
  }

  useEffect(() => {
    let cancelled = false;

    fetch("/api/on-demand/playback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId }),
    })
      .then(async (res) => {
        if (cancelled) return null;
        if (res.status === 402) {
          setError("subscription_required");
          return null;
        }
        if (!res.ok) {
          setError("playback_error");
          return null;
        }
        return (await res.json()) as PlaybackResponse;
      })
      .then((data) => {
        if (cancelled || !data) return;
        setPlayback(data);
      })
      .catch(() => {
        if (!cancelled) setError("playback_error");
      });

    return () => {
      cancelled = true;
    };
  }, [videoId]);

  useEffect(() => {
    if (!playback?.sessionId) return;

    const sessionId = playback.sessionId;
    let stopped = false;

    const tick = async () => {
      try {
        const res = await fetch("/api/on-demand/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (res.status === 409) {
          if (!stopped) {
            setSupersededState(true);
            onSuperseded?.();
          }
        }
      } catch {
        // Ignore transient errors; next tick retries.
      }
    };

    const interval = setInterval(tick, HEARTBEAT_INTERVAL_MS);
    const onUnload = () => {
      navigator.sendBeacon?.(
        "/api/on-demand/heartbeat",
        new Blob(
          [JSON.stringify({ sessionId, ended: true })],
          { type: "application/json" },
        ),
      );
    };
    window.addEventListener("beforeunload", onUnload);

    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener("beforeunload", onUnload);
      onUnload();
    };
  }, [playback?.sessionId, onSuperseded]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !playback) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: coachName ?? undefined,
      artwork: poster ? [{ src: poster }] : undefined,
    });
  }, [playback, title, coachName, poster]);

  if (supersededState) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black text-white">
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-base font-semibold">Reproducción detenida</p>
          <p className="text-sm text-white/70">
            Se detectó otra sesión activa. Recarga para retomar la reproducción.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-md px-4 py-2 text-sm font-semibold text-black"
            style={{ backgroundColor: colorAccent }}
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }

  if (error === "subscription_required") {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black text-white">
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-base font-semibold">Necesitas una suscripción</p>
          <p className="text-sm text-white/70">
            Suscríbete a On-Demand para ver este video.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black text-white">
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-base font-semibold">Error al iniciar el video</p>
          <p className="text-sm text-white/70">Intenta de nuevo en unos segundos.</p>
        </div>
      </div>
    );
  }

  if (!playback) {
    return (
      <div className="aspect-video w-full animate-pulse overflow-hidden rounded-xl bg-black/80" />
    );
  }

  const src = `https://iframe.cloudflarestream.com/${playback.token}?autoplay=true&letterboxColor=transparent&primaryColor=${encodeURIComponent(
    colorAccent,
  )}`;

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        className="h-full w-full border-0"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  );
}
