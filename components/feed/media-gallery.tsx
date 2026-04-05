"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface MediaItem {
  id: string;
  url: string;
  thumbnailUrl?: string | null;
  mimeType: string;
}

interface MediaGalleryProps {
  media: MediaItem[];
  className?: string;
}

const isVideo = (mime: string) => mime.startsWith("video/");

function InlineVideo({ src, className, onClick }: { src: string; className?: string; onClick: () => void }) {
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
      className={className}
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
}: {
  media: MediaItem[];
  initialIdx: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(initialIdx);
  const [dragX, setDragX] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const touchRef = useRef({ startX: 0, startY: 0, startTime: 0, locked: false });
  const containerRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (dir: 1 | -1) => {
      setTransitioning(true);
      setDragX(dir * -window.innerWidth * 0.4);
      setTimeout(() => {
        setIdx((p) => (p + dir + media.length) % media.length);
        setDragX(0);
        setTransitioning(false);
      }, 200);
    },
    [media.length],
  );

  const prev = useCallback(() => go(-1), [go]);
  const next = useCallback(() => go(1), [go]);

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
    const t = e.touches[0];
    touchRef.current = { startX: t.clientX, startY: t.clientY, startTime: Date.now(), locked: false };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const ref = touchRef.current;
    const dx = t.clientX - ref.startX;
    const dy = t.clientY - ref.startY;

    if (!ref.locked) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        ref.locked = true;
        if (Math.abs(dy) > Math.abs(dx)) return;
      } else {
        return;
      }
    }

    if (Math.abs(dx) >= Math.abs(dy)) {
      setDragX(dx);
    }
  };

  const handleTouchEnd = () => {
    const ref = touchRef.current;
    const elapsed = Date.now() - ref.startTime;
    const velocity = Math.abs(dragX) / Math.max(elapsed, 1);
    const threshold = window.innerWidth * 0.2;

    if ((Math.abs(dragX) > threshold || velocity > 0.5) && media.length > 1) {
      if (dragX < 0) next();
      else prev();
    } else {
      setDragX(0);
    }
  };

  const item = media[idx];

  return (
    <div className="fixed inset-0 z-[100] bg-black">
      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3">
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
        <div className="w-10" />
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

      {/* Swipeable media area */}
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={onClose}
      >
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            transform: `translateX(${dragX}px)`,
            transition: transitioning ? "transform 200ms ease-out" : dragX === 0 ? "transform 300ms ease-out" : "none",
            opacity: 1 - Math.min(Math.abs(dragX) / window.innerWidth, 0.3),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {isVideo(item.mimeType) ? (
            <video
              key={item.id}
              src={item.url}
              className="max-h-dvh w-full object-contain sm:max-h-[90dvh] sm:max-w-[90vw] sm:rounded-lg"
              controls
              autoPlay
              playsInline
            />
          ) : (
            <img
              key={item.id}
              src={item.url}
              alt=""
              className="max-h-dvh w-full object-contain sm:max-h-[90dvh] sm:max-w-[90vw] sm:rounded-lg"
              draggable={false}
            />
          )}
        </div>
      </div>

      {/* Bottom dots */}
      {media.length > 1 && media.length <= 10 && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center gap-1.5 pb-[max(env(safe-area-inset-bottom),20px)] sm:hidden">
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

export function MediaGallery({ media, className }: MediaGalleryProps) {
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
                  src={item.url}
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
        />
      )}
    </>
  );
}
