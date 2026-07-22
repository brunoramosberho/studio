"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MediaItem {
  id: string;
  url: string;
  thumbnailUrl?: string | null;
  mimeType: string;
  userId?: string;
  /** Who uploaded this photo — any attendee can add to a class post. */
  user?: { name: string | null; image: string | null } | null;
}

interface MediaGalleryProps {
  media: MediaItem[];
  className?: string;
  eventId?: string;
  currentUserId?: string;
  coachUserId?: string;
  onPhotoDeleted?: (photoId: string) => void;
  /**
   * Show the uploader tag in the lightbox. On by default for collaborative
   * class posts (any attendee can add a photo); off for studio posts, where the
   * author is already the studio and the uploader is an internal admin.
   */
  showUploader?: boolean;
}

const isVideo = (mime: string) => mime.startsWith("video/");

function InlineVideo({ src, poster, className, onClick }: { src: string; poster?: string | null; className?: string; onClick: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
          video.currentTime = 0;
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster || undefined}
      className={className}
      preload="metadata"
      muted
      loop
      playsInline
      onClick={onClick}
    />
  );
}

function LightboxVideo({
  src,
  poster,
  active,
}: {
  src: string;
  poster?: string | null;
  active: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Play when this becomes the on-screen media; pause + rewind when the user
  // swipes to another photo/video, so only the visible item ever plays. The
  // adjacent items are pre-mounted (for smooth swiping), so mount-time autoPlay
  // isn't enough — we drive playback off `active` instead.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      video.play().catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [active]);

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster || undefined}
      className="max-h-dvh w-full object-contain sm:max-h-[90dvh] sm:max-w-[90vw] sm:rounded-lg"
      controls
      preload={active ? "auto" : "metadata"}
      playsInline
    />
  );
}

function Lightbox({
  media,
  initialIdx,
  onClose,
  eventId,
  currentUserId,
  coachUserId,
  onDelete,
  showUploader,
}: {
  media: MediaItem[];
  initialIdx: number;
  onClose: () => void;
  eventId?: string;
  currentUserId?: string;
  coachUserId?: string;
  onDelete?: (photoId: string) => void;
  showUploader?: boolean;
}) {
  const [idx, setIdx] = useState(initialIdx);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const touchRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    direction: "h" | "v" | null;
    tracking: boolean;
  }>({ startX: 0, startY: 0, startTime: 0, direction: null, tracking: false });

  // ── Zoom (photos only) ────────────────────────────────────────────────
  // Pinch to zoom (anchored at the pinch point), one-finger pan while zoomed,
  // double-tap / double-click to toggle. While zoomed, swipe-to-navigate and
  // drag-to-dismiss are suspended — back at 1x they take over again.
  const [zoom, setZoom] = useState({ scale: 1, tx: 0, ty: 0 });
  const [zoomAnimating, setZoomAnimating] = useState(false);
  const pinchRef = useRef<{
    dist: number;
    midX: number;
    midY: number;
    scale: number;
    tx: number;
    ty: number;
  } | null>(null);
  const panRef = useRef<{ offX: number; offY: number; moved: boolean } | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const isZoomed = zoom.scale > 1.001;
  const activeIsImage = !isVideo(media[idx]?.mimeType ?? "");

  const MAX_SCALE = 4;
  const clampZoom = (scale: number, tx: number, ty: number) => {
    const s = Math.min(MAX_SCALE, Math.max(1, scale));
    // Cheap viewport-based bounds: enough travel to reach the corners, without
    // letting the photo fly off-screen.
    const maxX = ((s - 1) * window.innerWidth) / 2;
    const maxY = ((s - 1) * window.innerHeight) / 2;
    return {
      scale: s,
      tx: Math.min(maxX, Math.max(-maxX, tx)),
      ty: Math.min(maxY, Math.max(-maxY, ty)),
    };
  };

  const resetZoom = useCallback((animate = true) => {
    if (animate) setZoomAnimating(true);
    setZoom({ scale: 1, tx: 0, ty: 0 });
    pinchRef.current = null;
    panRef.current = null;
  }, []);

  /** Zoom towards a screen point, keeping that point visually fixed. */
  const zoomAtPoint = (pX: number, pY: number, targetScale: number) => {
    const cX = window.innerWidth / 2;
    const cY = window.innerHeight / 2;
    const uX = (pX - cX - zoom.tx) / zoom.scale;
    const uY = (pY - cY - zoom.ty) / zoom.scale;
    setZoomAnimating(true);
    setZoom(clampZoom(targetScale, pX - cX - uX * targetScale, pY - cY - uY * targetScale));
  };

  const toggleZoomAt = (pX: number, pY: number) => {
    if (isZoomed) resetZoom();
    else zoomAtPoint(pX, pY, 2.5);
  };

  const clampIdx = (i: number) => Math.max(0, Math.min(media.length - 1, i));

  const goTo = useCallback(
    (target: number) => {
      const clamped = clampIdx(target);
      if (clamped === idx && dragX === 0) return;
      // Changing photo always lands unzoomed.
      resetZoom(false);
      setAnimating(true);
      setDragX(0);
      setIdx(clamped);
    },
    [idx, dragX, media.length],
  );

  const prev = useCallback(() => goTo(idx - 1), [goTo, idx]);
  const next = useCallback(() => goTo(idx + 1), [goTo, idx]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose, prev, next]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (animating || dismissing) return;

    // Second finger lands on a photo → pinch. Cancel any in-flight swipe/drag.
    if (e.touches.length === 2 && activeIsImage) {
      const [a, b] = [e.touches[0], e.touches[1]];
      pinchRef.current = {
        dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
        midX: (a.clientX + b.clientX) / 2,
        midY: (a.clientY + b.clientY) / 2,
        ...zoom,
      };
      touchRef.current.tracking = false;
      panRef.current = null;
      if (dragX !== 0) {
        setAnimating(true);
        setDragX(0);
      }
      if (dragY !== 0) setDragY(0);
      return;
    }

    const t = e.touches[0];
    if (isZoomed) {
      panRef.current = { offX: t.clientX - zoom.tx, offY: t.clientY - zoom.ty, moved: false };
      return;
    }
    touchRef.current = { startX: t.clientX, startY: t.clientY, startTime: Date.now(), direction: null, tracking: true };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Pinch in progress: scale anchored at the midpoint (which may travel —
    // that's two-finger pan for free).
    if (pinchRef.current && e.touches.length >= 2) {
      const start = pinchRef.current;
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const midX = (a.clientX + b.clientX) / 2;
      const midY = (a.clientY + b.clientY) / 2;
      const s = start.scale * (dist / Math.max(start.dist, 1));
      const cX = window.innerWidth / 2;
      const cY = window.innerHeight / 2;
      const uX = (start.midX - cX - start.tx) / start.scale;
      const uY = (start.midY - cY - start.ty) / start.scale;
      setZoomAnimating(false);
      setZoom(clampZoom(s, midX - cX - uX * s, midY - cY - uY * s));
      return;
    }

    // One-finger pan while zoomed.
    if (panRef.current && e.touches.length === 1) {
      const t = e.touches[0];
      const p = panRef.current;
      const tx = t.clientX - p.offX;
      const ty = t.clientY - p.offY;
      if (Math.abs(tx - zoom.tx) > 2 || Math.abs(ty - zoom.ty) > 2) p.moved = true;
      setZoomAnimating(false);
      setZoom((z) => clampZoom(z.scale, tx, ty));
      return;
    }

    const ref = touchRef.current;
    if (!ref.tracking) return;
    const t = e.touches[0];
    const dx = t.clientX - ref.startX;
    const dy = t.clientY - ref.startY;

    if (!ref.direction) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        ref.direction = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
      } else {
        return;
      }
    }

    if (ref.direction === "v") {
      const down = Math.max(0, dy);
      setDragY(down);
      return;
    }

    const atStart = idx === 0 && dx > 0;
    const atEnd = idx === media.length - 1 && dx < 0;
    const dampened = (atStart || atEnd) ? dx * 0.3 : dx;
    setDragX(dampened);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Pinch released (or downgraded to one finger): snap back if ~1x.
    if (pinchRef.current) {
      if (e.touches.length >= 2) return;
      pinchRef.current = null;
      if (zoom.scale < 1.05) resetZoom();
      else if (e.touches.length === 1) {
        // One finger stayed down — hand off to panning.
        const t = e.touches[0];
        panRef.current = { offX: t.clientX - zoom.tx, offY: t.clientY - zoom.ty, moved: false };
      }
      return;
    }

    // Pan released; a motionless pan tap can be half of a double-tap-out.
    if (panRef.current) {
      const wasStationary = !panRef.current.moved;
      if (e.touches.length > 0) return;
      panRef.current = null;
      if (wasStationary) {
        const t = e.changedTouches[0];
        const now = Date.now();
        const last = lastTapRef.current;
        if (t && last && now - last.t < 300 && Math.hypot(t.clientX - last.x, t.clientY - last.y) < 40) {
          lastTapRef.current = null;
          resetZoom();
        } else if (t) {
          lastTapRef.current = { t: now, x: t.clientX, y: t.clientY };
        }
      }
      return;
    }

    const ref = touchRef.current;
    if (!ref.tracking) return;
    ref.tracking = false;

    // Tap (no direction ever resolved) → double-tap zooms in on the photo.
    if (!ref.direction && activeIsImage) {
      const elapsed = Date.now() - ref.startTime;
      if (elapsed < 300) {
        const now = Date.now();
        const last = lastTapRef.current;
        if (last && now - last.t < 300 && Math.hypot(ref.startX - last.x, ref.startY - last.y) < 40) {
          lastTapRef.current = null;
          toggleZoomAt(ref.startX, ref.startY);
        } else {
          lastTapRef.current = { t: now, x: ref.startX, y: ref.startY };
        }
      }
      return;
    }

    if (ref.direction === "v") {
      const elapsed = Date.now() - ref.startTime;
      const velocity = dragY / Math.max(elapsed, 1);
      if (dragY > 120 || velocity > 0.6) {
        setDismissing(true);
        setDragY(window.innerHeight);
        setTimeout(onClose, 250);
      } else {
        setDragY(0);
      }
      return;
    }

    if (ref.direction !== "h") return;

    const elapsed = Date.now() - ref.startTime;
    const velocity = dragX / Math.max(elapsed, 1);
    const threshold = window.innerWidth * 0.25;
    const flick = Math.abs(velocity) > 0.4;

    if ((dragX < -threshold || (flick && velocity < 0)) && idx < media.length - 1) {
      goTo(idx + 1);
    } else if ((dragX > threshold || (flick && velocity > 0)) && idx > 0) {
      goTo(idx - 1);
    } else {
      setAnimating(true);
      setDragX(0);
    }
  };

  const handleTransitionEnd = () => setAnimating(false);

  const [deleting, setDeleting] = useState(false);

  const canDelete = (() => {
    const item = media[idx];
    if (!item?.userId || !currentUserId || !eventId) return false;
    return item.userId === currentUserId || coachUserId === currentUserId;
  })();

  const handleDelete = async () => {
    const item = media[idx];
    if (!eventId || !item || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/feed/${eventId}/photos?photoId=${item.id}`, { method: "DELETE" });
      if (res.ok) {
        onDelete?.(item.id);
        if (media.length <= 1) {
          onClose();
        } else if (idx >= media.length - 1) {
          resetZoom(false);
          setIdx(idx - 1);
        }
      }
    } catch { /* ignore */ }
    setDeleting(false);
  };

  const stripOffset = -(idx * 100);
  const dismissProgress = typeof window !== "undefined" && window.innerHeight > 0
    ? Math.min(dragY / (window.innerHeight * 0.4), 1)
    : 0;
  const bgOpacity = 1 - dismissProgress * 0.8;
  const contentScale = 1 - dismissProgress * 0.08;

  const isDraggingDown = dragY > 0;

  return (
    <div
      className="fixed inset-0 z-[100]"
      style={{
        backgroundColor: `rgba(0,0,0,${bgOpacity})`,
        transition: isDraggingDown ? "none" : "background-color 250ms ease-out",
      }}
    >
      {/* Top bar — fade out on vertical drag */}
      <div
        className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3"
        style={{ opacity: 1 - dismissProgress, transition: isDraggingDown ? "none" : "opacity 250ms" }}
      >
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md active:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
        {media.length > 1 && (
          <span className="rounded-full bg-white/10 px-3 py-1 text-[13px] font-medium tabular-nums text-white/80 backdrop-blur-md">
            {idx + 1} / {media.length}
          </span>
        )}
        {canDelete ? (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md active:bg-red-500/40 disabled:opacity-50"
          >
            <Trash2 className="h-4.5 w-4.5" />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Desktop arrows */}
      {media.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white backdrop-blur-md transition-colors hover:bg-white/20 sm:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white backdrop-blur-md transition-colors hover:bg-white/20 sm:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Swipeable media strip. touch-action:none — every gesture (swipe,
          dismiss, pinch, pan, double-tap) is handled here, and it keeps the
          browser's own page-pinch from fighting ours. */}
      <div
        className="absolute inset-0 touch-none overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={onClose}
      >
        <div
          className="flex h-full will-change-transform"
          style={{
            width: `${media.length * 100}%`,
            transform: `translateX(calc(${stripOffset}% / ${media.length} + ${dragX}px)) translateY(${dragY}px) scale(${contentScale})`,
            transition: (animating || (!isDraggingDown && dragY === 0 && !dismissing))
              ? "transform 280ms cubic-bezier(.25,.46,.45,.94)"
              : dismissing
                ? "transform 250ms ease-out"
                : "none",
          }}
          onTransitionEnd={handleTransitionEnd}
        >
          {media.map((item, i) => {
            const isNearby = Math.abs(i - idx) <= 1;
            return (
              <div
                key={item.id}
                className="flex h-full items-center justify-center"
                style={{ width: `${100 / media.length}%` }}
                onClick={(e) => e.stopPropagation()}
              >
                {isNearby ? (
                  isVideo(item.mimeType) ? (
                    <LightboxVideo
                      src={item.url}
                      poster={item.thumbnailUrl}
                      active={i === idx}
                    />
                  ) : (
                    <img
                      src={item.url}
                      alt=""
                      className="max-h-dvh w-full object-contain sm:max-h-[90dvh] sm:max-w-[90vw] sm:rounded-lg"
                      draggable={false}
                      onDoubleClick={(e) => {
                        if (i === idx) toggleZoomAt(e.clientX, e.clientY);
                      }}
                      style={
                        i === idx && (isZoomed || zoomAnimating)
                          ? {
                              transform: `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.scale})`,
                              transition: zoomAnimating ? "transform 220ms cubic-bezier(.25,.46,.45,.94)" : "none",
                              cursor: isZoomed ? "grab" : undefined,
                            }
                          : undefined
                      }
                      onTransitionEnd={() => setZoomAnimating(false)}
                    />
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Uploader tag — story-style, so it's clear who posted this photo when
          any attendee can add to a class post. Tracks the active photo. */}
      {showUploader && media[idx]?.user?.name && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 bg-gradient-to-t from-black/55 via-black/15 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),18px)] pt-16"
          style={{ opacity: 1 - dismissProgress, transition: isDraggingDown ? "none" : "opacity 250ms" }}
        >
          {media[idx].user!.image ? (
            <img
              src={media[idx].user!.image!}
              alt=""
              className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-white/40"
              draggable={false}
            />
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/25 text-[11px] font-semibold text-white ring-1 ring-white/40">
              {media[idx].user!.name!.trim()[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <span className="max-w-[52vw] truncate text-[13px] font-semibold text-white drop-shadow-sm">
            {media[idx].user!.name}
          </span>
        </div>
      )}

      {/* Bottom dots */}
      {media.length > 1 && media.length <= 10 && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 flex justify-center gap-1.5 pb-[max(env(safe-area-inset-bottom),20px)] sm:hidden"
          style={{ opacity: 1 - dismissProgress, transition: isDraggingDown ? "none" : "opacity 250ms" }}
        >
          {media.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-200",
                i === idx ? "w-4 bg-card" : "w-1.5 bg-white/40",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MediaGallery({ media, className, eventId, currentUserId, coachUserId, onPhotoDeleted, showUploader = true }: MediaGalleryProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  if (media.length === 0) return null;

  return (
    <>
      {/* Grid */}
      <div
        className={cn(
          "overflow-hidden rounded-xl",
          media.length === 1 && "",
          media.length === 2 && "grid grid-cols-2 gap-0.5",
          media.length >= 3 && "grid grid-cols-2 gap-0.5",
          className,
        )}
      >
        {media.slice(0, 4).map((item, i) => {
          const showOverflow = i === 3 && media.length > 4;
          const tall = media.length === 3 && i === 0;

          return (
            <div
              key={item.id}
              className={cn(
                "relative block overflow-hidden bg-surface cursor-pointer",
                tall && "row-span-2",
              )}
              onClick={() => setLightboxIdx(i)}
            >
              {isVideo(item.mimeType) ? (
                <InlineVideo
                  src={item.url}
                  poster={item.thumbnailUrl}
                  className={cn(
                    "h-full w-full object-cover",
                    media.length === 1 && "aspect-[4/5]",
                    media.length === 2 && "aspect-square",
                    media.length >= 3 && !tall && "aspect-square",
                    tall && "h-full",
                  )}
                  onClick={() => setLightboxIdx(i)}
                />
              ) : (
                <img
                  src={item.thumbnailUrl || item.url}
                  alt=""
                  loading="lazy"
                  className={cn(
                    "w-full object-cover",
                    media.length === 1 && "aspect-[4/5]",
                    media.length === 2 && "aspect-square",
                    media.length >= 3 && !tall && "aspect-square",
                    tall && "h-full",
                  )}
                />
              )}

              {showOverflow && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <span className="text-xl font-bold text-white">
                    +{media.length - 3}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {lightboxIdx !== null && (
        <Lightbox
          media={media}
          initialIdx={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          eventId={eventId}
          currentUserId={currentUserId}
          coachUserId={coachUserId}
          onDelete={onPhotoDeleted}
          showUploader={showUploader}
        />
      )}
    </>
  );
}
