"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Video as VideoIcon,
  Clock,
  Lock,
  Sparkles,
  Check,
  Play,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useBranding } from "@/components/branding-provider";
import { SubscribeOnDemandSheet } from "@/components/on-demand/subscribe-sheet";
import { PageTransition } from "@/components/shared/page-transition";
import { cn } from "@/lib/utils";

interface VideoCard {
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
    name: string;
    photoUrl: string | null;
  } | null;
  classType: {
    id: string;
    name: string;
    color: string;
  } | null;
  category: {
    id: string;
    name: string;
    color: string;
  } | null;
}

interface CategoryOption {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

interface AccessInfo {
  hasAccess: boolean;
  reason:
    | "active_subscription"
    | "bundled_with_package"
    | "free_video"
    | "no_access";
  expiresAt?: string;
}

interface CatalogResponse {
  videos: VideoCard[];
  categories: CategoryOption[];
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
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatExpiry(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

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
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [freeOnly, setFreeOnly] = useState(false);
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

  // Categories come from the tenant config (admin-managed), not derived from
  // videos — so empty categories also appear once a video is assigned later.
  const categories = data?.categories ?? [];
  const hasFreeVideos = (data?.videos ?? []).some((v) => v.isFree);

  const videos = (data?.videos ?? []).filter((v) => {
    if (coachFilter && v.coachProfile?.id !== coachFilter) return false;
    if (categoryFilter && v.category?.id !== categoryFilter) return false;
    if (freeOnly && !v.isFree) return false;
    return true;
  });

  const hasAccess = data?.access.hasAccess ?? false;
  const enabled = data?.config?.enabled ?? false;
  const pkg = data?.config?.package ?? null;
  const expiry = formatExpiry(data?.access.expiresAt);

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
        {/* Header */}
        <header className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {t("title")}
            </h1>
            {hasAccess && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
              >
                <Check className="h-3 w-3" />
                {t("subActive")}
              </span>
            )}
          </div>
          <p className="text-sm text-muted">
            {hasAccess && expiry
              ? `${t("accessUntil")} ${expiry}`
              : t("subtitle")}
          </p>
        </header>

        {/* Paywall card (when no access yet) */}
        {!hasAccess && enabled && pkg && (
          <Card
            className="relative overflow-hidden border-0 shadow-warm-md"
            style={{
              background: `linear-gradient(135deg, ${colorAccent}1a 0%, ${colorAccent}05 100%)`,
            }}
          >
            <CardContent className="space-y-4 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${colorAccent}26`, color: colorAccent }}
                >
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-foreground sm:text-lg">
                    {t("unlockTitle")}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    {data?.config?.description ?? t("unlockSubtitle")}
                  </p>
                </div>
              </div>

              <div className="flex items-end justify-between gap-3">
                <div>
                  <span
                    className="font-mono text-2xl font-bold sm:text-3xl"
                    style={{ color: colorAccent }}
                  >
                    {pkg.price} {pkg.currency}
                  </span>
                  <span className="ml-1 text-sm text-muted">
                    /{pkg.recurringInterval === "year" ? "año" : "mes"}
                  </span>
                </div>
                <Button
                  onClick={() => setShowSubscribe(true)}
                  className="rounded-full px-5 font-semibold"
                  style={{ backgroundColor: colorAccent, color: "white" }}
                >
                  {t("subscribeCTA")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tenant has not enabled On-Demand at all */}
        {!enabled && !isLoading && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <VideoIcon className="h-10 w-10 text-muted/40" />
              <p className="text-sm font-medium text-foreground">{t("notAvailableTitle")}</p>
              <p className="max-w-sm text-xs text-muted">{t("notAvailableDesc")}</p>
            </CardContent>
          </Card>
        )}

        {/* Filter chips: bleed off the page padding for an app-like horizontal scroll */}
        {enabled && (categories.length > 0 || coaches.length > 0 || hasFreeVideos) && (
          <div className="-mx-4 overflow-x-auto scrollbar-none sm:-mx-6">
            <div className="flex gap-2 px-4 pb-1 sm:px-6">
              <FilterChip
                active={!categoryFilter && !coachFilter && !freeOnly}
                onClick={() => {
                  setCategoryFilter("");
                  setCoachFilter("");
                  setFreeOnly(false);
                }}
              >
                {t("levelAll")}
              </FilterChip>
              {hasFreeVideos && (
                <FilterChip
                  active={freeOnly}
                  color="#10b981"
                  onClick={() => setFreeOnly(!freeOnly)}
                >
                  {t("freeBadge")}
                </FilterChip>
              )}
              {categories.map((c) => (
                <FilterChip
                  key={`cat-${c.id}`}
                  active={categoryFilter === c.id}
                  color={c.color}
                  onClick={() =>
                    setCategoryFilter(categoryFilter === c.id ? "" : c.id)
                  }
                >
                  {c.name}
                </FilterChip>
              ))}
              {coaches.length > 0 && (categories.length > 0 || hasFreeVideos) && (
                <span className="my-auto h-5 w-px shrink-0 bg-border/60" aria-hidden />
              )}
              {coaches.map((c) => (
                <FilterChip
                  key={`coach-${c.id}`}
                  active={coachFilter === c.id}
                  onClick={() => setCoachFilter(coachFilter === c.id ? "" : c.id)}
                >
                  {c.name}
                </FilterChip>
              ))}
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-video w-full rounded-2xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && enabled && videos.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <VideoIcon className="h-10 w-10 text-muted/40" />
              <p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
              <p className="max-w-sm text-xs text-muted">{t("emptyDesc")}</p>
            </CardContent>
          </Card>
        )}

        {/* Video grid */}
        {!isLoading && videos.length > 0 && (
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4"
          >
            {videos.map((v) => {
              const thumb = v.thumbnailUrl ?? v.signedThumbnailUrl;
              const unlocked = hasAccess || v.isFree;
              return (
                <motion.div key={v.id} variants={fadeUp}>
                  <Link href={`/on-demand/${v.id}`} className="group block">
                    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-foreground/5 shadow-sm transition-transform duration-200 group-active:scale-[0.98] sm:group-hover:-translate-y-0.5 sm:group-hover:shadow-warm-md">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt={v.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <VideoIcon className="h-10 w-10 text-muted/30" />
                        </div>
                      )}

                      {/* Bottom gradient + duration */}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
                      {v.durationSeconds != null && v.durationSeconds > 0 && (
                        <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white sm:text-[11px]">
                          <Clock className="h-3 w-3" />
                          {formatDuration(v.durationSeconds)}
                        </div>
                      )}

                      {/* Top-left chip: category > discipline fallback */}
                      {v.category ? (
                        <div
                          className="absolute left-2 top-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm sm:text-[11px]"
                          style={{ backgroundColor: v.category.color }}
                        >
                          {v.category.name}
                        </div>
                      ) : v.classType ? (
                        <div
                          className="absolute left-2 top-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm sm:text-[11px]"
                          style={{ backgroundColor: v.classType.color }}
                        >
                          {v.classType.name}
                        </div>
                      ) : null}

                      {/* Hover/active play overlay (desktop only) */}
                      <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/15 opacity-0 transition-opacity duration-200 group-hover:opacity-100 sm:flex">
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg"
                          style={{ backgroundColor: colorAccent }}
                        >
                          <Play className="h-5 w-5 fill-white" />
                        </div>
                      </div>

                      {/* Top-right: free badge for free videos, lock for locked ones */}
                      {v.isFree ? (
                        <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm sm:text-[11px]">
                          <Sparkles className="h-3 w-3" />
                          {t("freeBadge")}
                        </div>
                      ) : !unlocked ? (
                        <div className="absolute right-2 top-2 inline-flex items-center justify-center rounded-full bg-black/60 p-1.5 text-white">
                          <Lock className="h-3 w-3" />
                        </div>
                      ) : null}
                    </div>

                    {/* Meta */}
                    <div className="mt-2 space-y-0.5 px-0.5">
                      <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground sm:text-sm">
                        {v.title}
                      </h3>
                      {v.coachProfile?.name && (
                        <p className="line-clamp-1 text-[11px] text-muted sm:text-xs">
                          {v.coachProfile.name}
                        </p>
                      )}
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      <SubscribeOnDemandSheet
        open={showSubscribe}
        onOpenChange={setShowSubscribe}
      />
    </PageTransition>
  );
}

function FilterChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors active:scale-[0.97]",
        active
          ? "border-transparent text-white shadow-sm"
          : "border-border/60 bg-card text-muted hover:bg-foreground/5 hover:text-foreground",
      )}
      style={
        active
          ? { backgroundColor: color ?? "var(--color-foreground)" }
          : undefined
      }
    >
      {children}
    </button>
  );
}
