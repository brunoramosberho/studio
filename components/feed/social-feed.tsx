"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useRef, useEffect } from "react";
import { FeedEventCard } from "./feed-event-card";
import { Loader2 } from "lucide-react";

interface FeedItem {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
  photos: { id: string; url: string; thumbnailUrl?: string | null; mimeType: string }[];
  likeCount: number;
  commentCount: number;
  liked: boolean;
}

interface FeedPage {
  feed: FeedItem[];
  nextCursor: string | null;
}

async function fetchFeed({
  pageParam,
}: {
  pageParam: string | null;
}): Promise<FeedPage> {
  const url = new URL("/api/feed", window.location.origin);
  url.searchParams.set("limit", "20");
  if (pageParam) url.searchParams.set("cursor", pageParam);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch feed");
  return res.json();
}

function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse overflow-hidden rounded-2xl border border-border/50 bg-white shadow-warm-sm"
        >
          <div className="flex items-start gap-3 p-4">
            <div className="h-10 w-10 rounded-full bg-surface" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-3/4 rounded bg-surface" />
              <div className="h-3 w-1/2 rounded bg-surface" />
            </div>
          </div>
          {i === 1 && (
            <div className="mx-4 mb-3 aspect-[4/3] rounded-xl bg-surface" />
          )}
          <div className="flex gap-2 border-t border-border/30 px-4 py-2">
            <div className="h-7 w-16 rounded-lg bg-surface" />
            <div className="h-7 w-16 rounded-lg bg-surface" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyFeed() {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <span className="text-4xl">🏠</span>
      <h3 className="mt-4 font-display text-lg font-semibold text-foreground">
        El feed está vacío
      </h3>
      <p className="mt-1 max-w-xs text-sm text-muted">
        Aquí aparecerán las actividades del estudio cuando se completen clases y
        se desbloqueen logros.
      </p>
    </div>
  );
}

export function SocialFeed() {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ["feed"],
      queryFn: fetchFeed,
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: 30_000,
    });

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: "200px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersect]);

  if (isLoading) return <FeedSkeleton />;

  const allEvents = data?.pages.flatMap((p) => p.feed) ?? [];

  if (allEvents.length === 0) return <EmptyFeed />;

  return (
    <div className="space-y-4">
      {allEvents.map((event) => (
        <FeedEventCard key={event.id} event={event} />
      ))}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="flex justify-center py-4">
        {isFetchingNextPage && (
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        )}
      </div>
    </div>
  );
}
