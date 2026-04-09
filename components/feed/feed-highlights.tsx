"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef, useCallback, useState } from "react";
import Link from "next/link";
import { ImageOff } from "lucide-react";

interface HighlightItem {
  id: string;
  title: string | null;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string;
  isExternal: boolean;
}

interface HighlightsResponse {
  highlights: HighlightItem[];
  enabled: boolean;
}

function trackClick(id: string) {
  fetch(`/api/highlights/${id}/click`, { method: "POST" }).catch(() => {});
}

function HighlightCard({ item }: { item: HighlightItem }) {
  const [imgError, setImgError] = useState(false);
  const handleClick = useCallback(() => {
    trackClick(item.id);
  }, [item.id]);

  const hasText = item.title || item.subtitle;

  const content = (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-stone-200 shadow-warm-sm transition-transform active:scale-[0.98]">
      {imgError ? (
        <div className="flex h-full w-full items-center justify-center bg-stone-200">
          <ImageOff className="h-8 w-8 text-stone-400" />
        </div>
      ) : (
        <img
          src={item.imageUrl}
          alt={item.title || ""}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      )}
      {hasText && !imgError && (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-3.5">
            {item.title && (
              <p className="text-[13px] font-bold leading-tight text-white drop-shadow-sm">
                {item.title}
              </p>
            )}
            {item.subtitle && (
              <p className="mt-0.5 text-[11px] leading-snug text-white/80">
                {item.subtitle}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );

  if (item.isExternal) {
    return (
      <a
        href={item.linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className="block w-[68vw] max-w-[260px] shrink-0 snap-start"
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      href={item.linkUrl}
      onClick={handleClick}
      className="block w-[68vw] max-w-[260px] shrink-0 snap-start"
    >
      {content}
    </Link>
  );
}

export function FeedHighlights() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<HighlightsResponse>({
    queryKey: ["feed-highlights"],
    queryFn: () => fetch("/api/highlights").then((r) => r.json()),
    staleTime: 60_000,
  });

  if (isLoading || !data?.enabled || data.highlights.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-3 font-display text-[17px] font-bold text-foreground">
        Highlights
      </h2>
      <div
        ref={scrollRef}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-4 pb-2 scrollbar-none sm:-mx-6 sm:scroll-pl-6"
      >
        {data.highlights.map((item, i) => {
          const isFirst = i === 0;
          const isLast = i === data.highlights.length - 1;
          return (
            <div
              key={item.id}
              style={{
                marginLeft: isFirst ? "1rem" : undefined,
                marginRight: isLast ? "1rem" : undefined,
              }}
            >
              <HighlightCard item={item} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
