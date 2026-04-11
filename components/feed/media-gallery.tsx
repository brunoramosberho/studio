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
}

interface MediaGalleryProps {
  media: MediaItem[];
  className?: string;
  eventId?: string;
  currentUserId?: string;
  coachUserId?: string;
  onPhotoDeleted?: (photoId: string) => void;
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

function Lightbox({
  media,
  initialIdx,
  onClose,
  eventId,
  currentUserId,
  coachUserId,
  onDelete,
}: {
  media: MediaItem[];
  initialIdx: number;
  onClose: () => void;
  eventId?: string;
  currentUserId?: string;
  coachUserId?: string;
  onDelete?: (photoId: string) => void;
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

  const clampIdx = (i: number) => Math.max(0, Math.min(media.length - 1, i));

  const goTo = useCallback(
    (target: number) => {
      const clamped = clampIdx(target);
      if (clamped === idx && dragX === 0) return;
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
    const t = e.touches[0];
    touchRef.current = { startX: t.clientX, startY: t.clientY, startTime: Date.now(), direction: null, tracking: true };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
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

  const handleTouchEnd = () => {
    const ref = touchRef.current;
    if (!ref.tracking) return;
    ref.tracking = false;

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

      {/* Swipeable media strip */}
      <div
        className="absolute inset-0 overflow-hidden"
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
                    <video
                      src={item.url}
                      poster={item.thumbnailUrl || undefined}
                      className="max-h-dvh w-full object-contain sm:max-h-[90dvh] sm:max-w-[90vw] sm:rounded-lg"
                      controls
                      autoPlay={i === idx}
                      preload={i === idx ? "auto" : "metadata"}
                      playsInline
                    />
                  ) : (
                    <img
                      src={item.url}
                      alt=""
                      className="max-h-dvh w-full object-contain sm:max-h-[90dvh] sm:max-w-[90vw] sm:rounded-lg"
                      draggable={false}
                    />
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

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
                i === idx ? "w-4 bg-white" : "w-1.5 bg-white/40",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MediaGallery({ media, className, eventId, currentUserId, coachUserId, onPhotoDeleted }: MediaGalleryProps) {
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
                    media.length === 1 && "aspect-[4/3]",
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
                    media.length === 1 && "aspect-[4/3]",
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
        />
      )}
    </>
  );
}
