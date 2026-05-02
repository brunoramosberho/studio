"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRef } from "react";
import { Clock, Lock, PlayCircle, Video } from "lucide-react";

interface VideoCard {
  id: string;
  title: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  cloudflareThumbnailUrl: string | null;
  signedThumbnailUrl: string | null;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ALL";
  coachProfile: { id: string; name: string } | null;
  classType: { id: string; name: string; color: string } | null;
}

interface CatalogResponse {
  videos: VideoCard[];
  config: { enabled: boolean } | null;
  access: { hasAccess: boolean };
}

const REEL_LIMIT = 10;

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Horizontal scroll of the most recent published On-Demand videos. Renders
 * inline in the feed for discovery. Tapping a card navigates to the video
 * detail page, which gates playback by subscription. If the studio hasn't
 * enabled On-Demand the section doesn't render at all.
 */
export function OnDemandReel() {
  const t = useTranslations("feed");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["on-demand-reel"],
    queryFn: async () => {
      const res = await fetch("/api/on-demand/catalog");
      if (!res.ok) throw new Error("Failed");
      return (await res.json()) as CatalogResponse;
    },
    staleTime: 60_000,
  });

  if (!data?.config?.enabled) return null;

  const videos = (data.videos ?? []).slice(0, REEL_LIMIT);
  if (videos.length === 0) return null;

  const hasAccess = data.access.hasAccess;

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="font-display text-[17px] font-bold text-foreground">
          {t("onDemandReelTitle")}
        </h2>
        <Link
          href="/on-demand"
          className="text-[13px] font-semibold text-accent hover:underline"
        >
          {t("seeAll")}
        </Link>
      </div>

      <div
        ref={scrollRef}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-4 pb-2 scrollbar-none sm:-mx-6 sm:scroll-pl-6"
      >
        {videos.map((v, i) => {
          const thumb = v.thumbnailUrl ?? v.signedThumbnailUrl;
          const duration = formatDuration(v.durationSeconds);
          const isFirst = i === 0;
          const isLast = i === videos.length - 1;

          return (
            <Link
              key={v.id}
              href={`/on-demand/${v.id}`}
              className="flex w-[72vw] max-w-[280px] shrink-0 snap-start flex-col"
              style={{
                marginLeft: isFirst ? "1rem" : undefined,
                marginRight: isLast ? "1rem" : undefined,
              }}
            >
              <div className="relative aspect-[3/2] w-full overflow-hidden rounded-2xl bg-foreground/10">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt={v.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Video className="h-12 w-12 text-white/25" />
                  </div>
                )}

                {/* Subtle dark overlay so play icon stays readable on bright thumbs */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/30" />

                {/* Play icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                    {hasAccess ? (
                      <PlayCircle className="h-7 w-7 text-white" />
                    ) : (
                      <Lock className="h-5 w-5 text-white" />
                    )}
                  </div>
                </div>

                {/* Duration pill */}
                {duration && (
                  <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
                    <Clock className="h-3 w-3" />
                    {duration}
                  </div>
                )}

                {/* Discipline pill bottom-left */}
                {v.classType && (
                  <div
                    className="absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: v.classType.color }}
                  >
                    {v.classType.name}
                  </div>
                )}
              </div>

              <div className="mt-2 space-y-0.5">
                <p className="line-clamp-1 text-left text-[14px] font-semibold text-foreground">
                  {v.title}
                </p>
                {v.coachProfile?.name && (
                  <p className="line-clamp-1 text-left text-[12px] text-muted">
                    {v.coachProfile.name}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
