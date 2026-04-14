"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { FeedEventCard } from "./feed-event-card";
import { FeedPwaHint } from "./feed-pwa-hint";
import { DiscoverDisciplines } from "./discover-disciplines";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface FeedItem {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
  photos: { id: string; url: string; thumbnailUrl?: string | null; mimeType: string; userId?: string }[];
  polls?: {
    id: string;
    title: string | null;
    totalVotes: number;
    myVote: string | null;
    options: { id: string; text: string; position: number; voteCount: number }[];
  }[];
  likeCount: number;
  commentCount: number;
  liked: boolean;
  isPinned?: boolean;
  currentUserBooked?: boolean;
  reservedBy?: { id: string; name: string | null; image: string | null }[];
  studioName?: string;
}

interface DisciplineItem {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  icon?: string | null;
  mediaUrl?: string | null;
  tags: string[];
  duration: number;
  level: string;
}

interface FeedPage {
  feed: FeedItem[];
  nextCursor: string | null;
  totalClasses?: number;
  disciplines?: DisciplineItem[];
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
          className="animate-pulse overflow-hidden rounded-2xl border border-border/50 bg-card shadow-warm-sm"
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
  const t = useTranslations("feed");
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <span className="text-4xl">👋</span>
      <h3 className="mt-4 font-display text-lg font-semibold text-foreground">
        {t("emptyTitle")}
      </h3>
      <p className="mt-1 max-w-xs text-sm text-muted">
        {t("emptyDesc")}
      </p>
    </div>
  );
}

export function SocialFeed() {
  const t = useTranslations("feed");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrolledRef = useRef(false);
  const searchParams = useSearchParams();
  const highlightPostId = searchParams.get("post");

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ["feed"],
      queryFn: ({ pageParam }) => fetchFeed({ pageParam }),
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

  useEffect(() => {
    if (!highlightPostId || isLoading || scrolledRef.current) return;
    const el = document.getElementById(`post-${highlightPostId}`);
    if (!el) return;
    scrolledRef.current = true;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-accent/40");
      setTimeout(() => el.classList.remove("ring-2", "ring-accent/40"), 3000);
    });
  }, [highlightPostId, isLoading, data]);

  const rawEvents = data?.pages.flatMap((p) => p.feed) ?? [];
  const pinned = rawEvents.filter((e) => e.isPinned);
  const unpinned = rawEvents.filter((e) => !e.isPinned);
  const allEvents = [...pinned, ...unpinned];
  const firstPage = data?.pages[0];
  const disciplines = firstPage?.disciplines ?? [];
  const showDiscover = disciplines.length > 0;

  return (
    <div className="space-y-4">
      <FeedPwaHint />

      {showDiscover && !isLoading && (
        <DiscoverDisciplines disciplines={disciplines} />
      )}

      {!isLoading && allEvents.length > 0 && (
        <h2 className="font-display text-[17px] font-bold text-foreground">
          {t("communityActivity")}
        </h2>
      )}

      {isLoading ? (
        <FeedSkeleton />
      ) : allEvents.length === 0 ? (
        <EmptyFeed />
      ) : (
        <div className="-mx-4 sm:mx-0">
          <div className="space-y-2 sm:space-y-4">
            {allEvents.map((event) => (
              <FeedEventCard key={event.id} event={event} />
            ))}
          </div>
          <div ref={sentinelRef} className="flex justify-center py-6">
            {isFetchingNextPage && (
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
