"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Video as VideoIcon,
  Clock,
  Lock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBranding } from "@/components/branding-provider";
import { SubscribeOnDemandSheet } from "@/components/on-demand/subscribe-sheet";

interface VideoCard {
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
  } | null;
  classType: {
    id: string;
    name: string;
    color: string;
  } | null;
}

interface AccessInfo {
  hasAccess: boolean;
  reason: "active_subscription" | "bundled_with_package" | "no_access";
  expiresAt?: string;
}

interface CatalogResponse {
  videos: VideoCard[];
  config: {
    enabled: boolean;
    description: string | null;
    package: {
      id: string;
      name: string;
      price: number;
      currency: string;
      recurringInterval: string | null;
    } | null;
  } | null;
  access: AccessInfo;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function classNamesByLevel(level: string, t: (k: string) => string): string {
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

export function OnDemandCatalogClient() {
  const t = useTranslations("onDemand");
  const { colorAccent } = useBranding();

  const { data, isLoading } = useQuery({
    queryKey: ["on-demand-catalog"],
    queryFn: async () => {
      const res = await fetch("/api/on-demand/catalog");
      if (!res.ok) throw new Error("Failed");
      return (await res.json()) as CatalogResponse;
    },
  });

  const [coachFilter, setCoachFilter] = useState<string>("");
  const [disciplineFilter, setDisciplineFilter] = useState<string>("");
  const [showSubscribe, setShowSubscribe] = useState(false);

  const coaches = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    (data?.videos ?? []).forEach((v) => {
      if (v.coachProfile) {
        map.set(v.coachProfile.id, { id: v.coachProfile.id, name: v.coachProfile.name });
      }
    });
    return Array.from(map.values());
  }, [data?.videos]);

  const disciplines = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    (data?.videos ?? []).forEach((v) => {
      if (v.classType) {
        map.set(v.classType.id, { id: v.classType.id, name: v.classType.name });
      }
    });
    return Array.from(map.values());
  }, [data?.videos]);

  const videos = (data?.videos ?? []).filter((v) => {
    if (coachFilter && v.coachProfile?.id !== coachFilter) return false;
    if (disciplineFilter && v.classType?.id !== disciplineFilter) return false;
    return true;
  });

  const hasAccess = data?.access.hasAccess ?? false;
  const enabled = data?.config?.enabled ?? false;
  const pkg = data?.config?.package ?? null;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>
      </header>

      {!hasAccess && enabled && pkg && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${colorAccent}1a`, color: colorAccent }}
              >
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">{t("unlockTitle")}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {data?.config?.description ?? t("unlockSubtitle")}
                </p>
                <p className="mt-2 text-sm font-semibold" style={{ color: colorAccent }}>
                  {pkg.price} {pkg.currency} / {pkg.recurringInterval ?? "month"}
                </p>
              </div>
            </div>
            <Button
              onClick={() => setShowSubscribe(true)}
              className="self-stretch sm:self-center"
              style={{ backgroundColor: colorAccent, color: "white" }}
            >
              {t("subscribeCTA")}
            </Button>
          </CardContent>
        </Card>
      )}

      {!enabled && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <VideoIcon className="h-10 w-10 text-muted/40" />
            <p className="text-sm font-medium text-foreground">{t("notAvailableTitle")}</p>
            <p className="max-w-sm text-xs text-muted">{t("notAvailableDesc")}</p>
          </CardContent>
        </Card>
      )}

      {enabled && (coaches.length > 0 || disciplines.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {disciplines.length > 0 && (
            <select
              value={disciplineFilter}
              onChange={(e) => setDisciplineFilter(e.target.value)}
              className="h-9 rounded-md border border-border/60 bg-card px-3 text-sm"
            >
              <option value="">{t("allDisciplines")}</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          {coaches.length > 0 && (
            <select
              value={coachFilter}
              onChange={(e) => setCoachFilter(e.target.value)}
              className="h-9 rounded-md border border-border/60 bg-card px-3 text-sm"
            >
              <option value="">{t("allCoaches")}</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-lg" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        enabled && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <VideoIcon className="h-10 w-10 text-muted/40" />
              <p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
              <p className="max-w-sm text-xs text-muted">{t("emptyDesc")}</p>
            </CardContent>
          </Card>
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => {
            const thumb = v.thumbnailUrl ?? v.cloudflareThumbnailUrl;
            const href = `/on-demand/${v.id}`;
            return (
              <Link key={v.id} href={href} className="group">
                <Card className="overflow-hidden transition-transform group-hover:scale-[1.01]">
                  <div className="relative aspect-video w-full bg-foreground/5">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt={v.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <VideoIcon className="h-10 w-10 text-muted/30" />
                      </div>
                    )}
                    {v.durationSeconds && (
                      <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
                        <Clock className="h-3 w-3" />
                        {formatDuration(v.durationSeconds)}
                      </div>
                    )}
                  </div>
                  <CardContent className="p-3">
                    <h3 className="line-clamp-2 text-sm font-semibold text-foreground">
                      {v.title}
                    </h3>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                      {v.coachProfile?.name && <span>{v.coachProfile.name}</span>}
                      {v.classType?.name && (
                        <>
                          <span>·</span>
                          <span>{v.classType.name}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px]">
                        {classNamesByLevel(v.level, t)}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <SubscribeOnDemandSheet
        open={showSubscribe}
        onOpenChange={setShowSubscribe}
      />
    </div>
  );
}
