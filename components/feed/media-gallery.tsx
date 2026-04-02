"use client";

import { useState, useRef, useEffect } from "react";
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

export function MediaGallery({ media, className }: MediaGalleryProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  if (media.length === 0) return null;

  const isVideo = (mime: string) => mime.startsWith("video/");

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

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightboxIdx(null)}
        >
          <button
            onClick={() => setLightboxIdx(null)}
            className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>

          {media.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIdx((p) =>
                    p !== null ? (p - 1 + media.length) % media.length : 0,
                  );
                }}
                className="absolute left-3 z-10 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIdx((p) =>
                    p !== null ? (p + 1) % media.length : 0,
                  );
                }}
                className="absolute right-3 z-10 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <div
            className="relative max-h-[85dvh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            {isVideo(media[lightboxIdx].mimeType) ? (
              <video
                src={media[lightboxIdx].url}
                className="max-h-[85dvh] rounded-lg"
                controls
                autoPlay
                playsInline
              />
            ) : (
              <img
                src={media[lightboxIdx].url}
                alt=""
                className="max-h-[85dvh] rounded-lg object-contain"
              />
            )}
          </div>

          <div className="absolute bottom-6 text-sm text-white/60">
            {lightboxIdx + 1} / {media.length}
          </div>
        </div>
      )}
    </>
  );
}
