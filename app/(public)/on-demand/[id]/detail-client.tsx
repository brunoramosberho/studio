"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ChevronLeft, Lock, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OnDemandVideoPlayer } from "@/components/on-demand/video-player";
import { SubscribeOnDemandSheet } from "@/components/on-demand/subscribe-sheet";
import { useBranding } from "@/components/branding-provider";

interface VideoDetail {
  id: string;
  title: string;
  description: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  cloudflareThumbnailUrl: string | null;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ALL";
  coachProfile: {
    id: string;
    name: string;
    photoUrl: string | null;
    bio: string | null;
  } | null;
  classType: { id: string; name: string; color: string } | null;
}

interface AccessInfo {
  hasAccess: boolean;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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
  const hasAccess = catalogData?.access.hasAccess ?? false;
  const poster = video?.thumbnailUrl ?? video?.cloudflareThumbnailUrl ?? null;

  return (
    <div className="space-y-4">
      <Link
        href="/on-demand"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("backToCatalog")}
      </Link>

      {isLoading || !video ? (
        <div className="space-y-3">
          <Skeleton className="aspect-video w-full" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <>
          {hasAccess ? (
            <OnDemandVideoPlayer
              videoId={video.id}
              title={video.title}
              poster={poster}
              coachName={video.coachProfile?.name ?? null}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Lock className="h-10 w-10 text-muted/40" />
                <p className="text-sm font-medium text-foreground">{t("lockedTitle")}</p>
                <p className="max-w-sm text-xs text-muted">{t("lockedDesc")}</p>
                <Button
                  onClick={() => setShowSubscribe(true)}
                  style={{ backgroundColor: colorAccent, color: "white" }}
                >
                  {t("subscribeCTA")}
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {video.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              {video.coachProfile?.name && <span>{video.coachProfile.name}</span>}
              {video.classType?.name && (
                <>
                  <span>·</span>
                  <span>{video.classType.name}</span>
                </>
              )}
              {video.durationSeconds && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDuration(video.durationSeconds)}
                  </span>
                </>
              )}
            </div>
            <Badge variant="outline" className="text-[10px]">
              {video.level === "ALL"
                ? t("levelAll")
                : video.level === "BEGINNER"
                ? t("levelBeginner")
                : video.level === "INTERMEDIATE"
                ? t("levelIntermediate")
                : t("levelAdvanced")}
            </Badge>
            {video.description && (
              <p className="pt-2 text-sm text-foreground/80">{video.description}</p>
            )}
          </div>
        </>
      )}

      <SubscribeOnDemandSheet
        open={showSubscribe}
        onOpenChange={setShowSubscribe}
      />
    </div>
  );
}
