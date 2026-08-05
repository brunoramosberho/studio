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

/** The slice of Cloudflare's player API we use. */
interface StreamPlayer {
  currentTime: number;
  addEventListener: (event: string, handler: () => void) => void;
  removeEventListener: (event: string, handler: () => void) => void;
}

export function OnDemandVideoPlayer({
  videoId,
  title,
  poster,
  coachName,
  onSuperseded,
}: OnDemandVideoPlayerProps) {
  const { colorAccent } = useBranding();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // What the player reports, kept in refs so the heartbeat reads the latest
  // values without re-subscribing on every tick.
  const watchedRef = useRef(0);
  const furthestRef = useRef(0);
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

  // Measure real playback, not wall-clock. The heartbeat below is a plain
  // interval that keeps firing while paused or backgrounded, so on its own it
  // would report "time with the tab open" and overstate every video's
  // engagement. Cloudflare's player SDK wraps the existing iframe and reports
  // what actually happened.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!playback?.sessionId || !iframe) return;

    let detach: (() => void) | undefined;
    let cancelled = false;

    const attach = () => {
      const Stream = (window as unknown as { Stream?: (el: HTMLIFrameElement) => StreamPlayer })
        .Stream;
      if (!Stream || cancelled) return;
      const player = Stream(iframe);

      let playingSince: number | null = null;
      const accumulate = () => {
        if (playingSince != null) {
          watchedRef.current += (Date.now() - playingSince) / 1000;
          playingSince = null;
        }
      };

      const onPlay = () => { playingSince = Date.now(); };
      const onPause = () => accumulate();
      const onTimeUpdate = () => {
        const t = player.currentTime;
        if (typeof t === "number" && t > furthestRef.current) furthestRef.current = t;
      };
      const onEnded = () => accumulate();

      player.addEventListener("play", onPlay);
      player.addEventListener("pause", onPause);
      player.addEventListener("timeupdate", onTimeUpdate);
      player.addEventListener("ended", onEnded);

      detach = () => {
        accumulate();
        player.removeEventListener("play", onPlay);
        player.removeEventListener("pause", onPause);
        player.removeEventListener("timeupdate", onTimeUpdate);
        player.removeEventListener("ended", onEnded);
      };
    };

    if ((window as unknown as { Stream?: unknown }).Stream) {
      attach();
    } else {
      const script = document.createElement("script");
      script.src = "https://embed.cloudflarestream.com/embed/sdk.latest.js";
      script.async = true;
      script.onload = attach;
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      detach?.();
    };
  }, [playback?.sessionId]);

  useEffect(() => {
    if (!playback?.sessionId) return;

    const sessionId = playback.sessionId;
    let stopped = false;

    const tick = async () => {
      try {
        const res = await fetch("/api/on-demand/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            watchedSeconds: Math.round(watchedRef.current),
            furthestSeconds: Math.round(furthestRef.current),
          }),
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
          [
            JSON.stringify({
              sessionId,
              ended: true,
              watchedSeconds: Math.round(watchedRef.current),
              furthestSeconds: Math.round(furthestRef.current),
            }),
          ],
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
