"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  ChevronLeft,
  Lock,
  Clock,
  Sparkles,
  ChevronRight,
  Video as VideoIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { OnDemandVideoPlayer } from "@/components/on-demand/video-player";
import { SubscribeOnDemandSheet } from "@/components/on-demand/subscribe-sheet";
import { useBranding } from "@/components/branding-provider";
import { PageTransition } from "@/components/shared/page-transition";

interface VideoDetail {
  id: string;
  title: string;
  description: string | null;
  durationSeconds: number | null;
  isFree: boolean;
  thumbnailUrl: string | null;
  cloudflareThumbnailUrl: string | null;
  signedThumbnailUrl: string | null;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ALL";
  coachProfile: {
    id: string;
    userId: string | null;
    name: string;
    photoUrl: string | null;
    bio: string | null;
  } | null;
  classType: { id: string; name: string; color: string } | null;
  category: { id: string; name: string; color: string } | null;
}

interface AccessInfo {
  hasAccess: boolean;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function levelLabel(
  level: VideoDetail["level"],
  t: (k: string) => string,
): string {
  switch (level) {
    case "BEGINNER":
      return t("levelBeginner");
    case "INTERMEDIATE":
      return t("levelIntermediate");
    case "ADVANCED":
      return t("levelAdvanced");
    default:
      return t("levelAll");
  }
}

export function OnDemandDetailClient({ videoId }: { videoId: string }) {
  const t = useTranslations("onDemand");
  const { colorAccent } = useBranding();

  const { data: videoData, isLoading } = useQuery({
    queryKey: ["on-demand-video", videoId],
    queryFn: async () => {
      const res = await fetch(`/api/on-demand/video/${videoId}`);
      if (!res.ok) throw new Error("Failed");
      return (await res.json()) as { video: VideoDetail };
    },
  });

  const { data: catalogData } = useQuery({
    queryKey: ["on-demand-catalog"],
    queryFn: async () => {
      const res = await fetch("/api/on-demand/catalog");
      if (!res.ok) throw new Error("Failed");
      return (await res.json()) as { access: AccessInfo };
    },
  });

  const [showSubscribe, setShowSubscribe] = useState(false);

  const video = videoData?.video;
  const tenantAccess = catalogData?.access.hasAccess ?? false;
  const canWatch = tenantAccess || (video?.isFree ?? false);
  const poster = video?.thumbnailUrl ?? video?.signedThumbnailUrl ?? null;

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl">
        {/* Top bar with iOS-style back button. Pinned to the top of the
            content (not sticky) so the full-bleed video can sit right under it. */}
        <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
          <Link
            href="/on-demand"
            className="inline-flex h-9 items-center gap-1 rounded-full pl-1 pr-3 text-sm font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-foreground active:bg-foreground/10"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground/5">
              <ChevronLeft className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">{t("backToCatalog")}</span>
          </Link>

          <div className="flex items-center gap-1.5">
            {video?.isFree && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm">
                <Sparkles className="h-3 w-3" />
                {t("freeBadge")}
              </span>
            )}
            {video?.category ? (
              <span
                className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm"
                style={{ backgroundColor: video.category.color }}
              >
                {video.category.name}
              </span>
            ) : video?.classType ? (
              <span
                className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm"
                style={{ backgroundColor: video.classType.color }}
              >
                {video.classType.name}
              </span>
            ) : null}
          </div>
        </div>

        {/* Loading state */}
        {isLoading || !video ? (
          <div className="space-y-4">
            <div className="-mx-4 sm:mx-0">
              <Skeleton className="aspect-video w-full sm:rounded-2xl" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ) : (
          <>
            {/* Player / locked state. Mobile: full-bleed (escape page padding).
                Desktop: rounded card. */}
            <div className="-mx-4 sm:mx-0 sm:overflow-hidden sm:rounded-2xl">
              {canWatch ? (
                <OnDemandVideoPlayer
                  videoId={video.id}
                  title={video.title}
                  poster={poster}
                  coachName={video.coachProfile?.name ?? null}
                />
              ) : (
                <LockedPreview
                  poster={poster}
                  title={video.title}
                  duration={video.durationSeconds}
                  onSubscribe={() => setShowSubscribe(true)}
                  colorAccent={colorAccent}
                  t={t}
                />
              )}
            </div>

            {/* Title + meta */}
            <div className="mt-4 space-y-1.5 sm:mt-5">
              <h1 className="font-display text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl">
                {video.title}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                {video.durationSeconds != null && video.durationSeconds > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDuration(video.durationSeconds)}
                  </span>
                )}
                <span className="inline-flex items-center rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                  {levelLabel(video.level, t)}
                </span>
              </div>
            </div>

            {/* Coach row. Only an interactive link when the coach is also a
                user (has a profile page at /my/user/<userId>). Otherwise we
                render a static card so we don't ship a dead chevron. */}
            {video.coachProfile && (() => {
              const coach = video.coachProfile;
              const inner = (
                <>
                  <Avatar className="h-10 w-10">
                    {coach.photoUrl && (
                      <AvatarImage src={coach.photoUrl} alt={coach.name} />
                    )}
                    <AvatarFallback>
                      {coach.name
                        .split(" ")
                        .slice(0, 2)
                        .map((s) => s[0])
                        .join("")
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
                      {t("instructor")}
                    </p>
                    <p className="truncate text-sm font-semibold text-foreground">
                      {coach.name}
                    </p>
                  </div>
                </>
              );
              return coach.userId ? (
                <Link
                  href={`/my/user/${coach.userId}`}
                  className="mt-4 flex items-center gap-3 rounded-2xl border border-border/50 px-3 py-2.5 transition-colors hover:bg-foreground/[0.03] active:bg-foreground/5"
                >
                  {inner}
                  <ChevronRight className="h-4 w-4 text-muted" />
                </Link>
              ) : (
                <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border/50 px-3 py-2.5">
                  {inner}
                </div>
              );
            })()}

            {/* Description */}
            {video.description && (
              <div className="mt-4 rounded-2xl border border-border/50 bg-card p-4 sm:p-5">
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {t("descriptionLabel")}
                </h2>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                  {video.description}
                </p>
              </div>
            )}

            {/* Subscription paywall card (only when no access) */}
            {!canWatch && (
              <Card
                className="mt-4 overflow-hidden border-0 shadow-warm-md sm:mt-5"
                style={{
                  background: `linear-gradient(135deg, ${colorAccent}1f 0%, ${colorAccent}08 100%)`,
                }}
              >
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${colorAccent}26`, color: colorAccent }}
                    >
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-foreground">
                        {t("lockedTitle")}
                      </p>
                      <p className="mt-0.5 text-sm text-muted">{t("lockedDesc")}</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => setShowSubscribe(true)}
                    className="w-full rounded-full font-semibold"
                    style={{ backgroundColor: colorAccent, color: "white" }}
                  >
                    {t("subscribeCTA")}
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <SubscribeOnDemandSheet
        open={showSubscribe}
        onOpenChange={setShowSubscribe}
      />
    </PageTransition>
  );
}

function LockedPreview({
  poster,
  title,
  duration,
  onSubscribe,
  colorAccent,
  t,
}: {
  poster: string | null;
  title: string;
  duration: number | null;
  onSubscribe: () => void;
  colorAccent: string;
  t: (k: string) => string;
}) {
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black sm:rounded-2xl">
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt={title}
          className="h-full w-full scale-110 object-cover blur-md saturate-90"
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-foreground/10">
          <VideoIcon className="h-12 w-12 text-white/30" />
        </div>
      )}
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-md"
          style={{ backgroundColor: `${colorAccent}cc` }}
        >
          <Lock className="h-6 w-6" />
        </div>
        <p className="text-base font-semibold sm:text-lg">{t("lockedTitle")}</p>
        <Button
          onClick={onSubscribe}
          className="rounded-full px-5 font-semibold"
          style={{ backgroundColor: colorAccent, color: "white" }}
        >
          {t("subscribeCTA")}
        </Button>
      </div>
      {duration != null && duration > 0 && (
        <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          <Clock className="h-3 w-3" />
          {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, "0")}
        </div>
      )}
    </div>
  );
}
