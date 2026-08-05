"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { BarChart3, ChevronDown, ChevronRight, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDuration } from "@/lib/on-demand/metrics";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface VideoRow {
  id: string;
  title: string;
  status: string;
  published: boolean;
  durationSeconds: number | null;
  coachName: string | null;
  plays: number;
  uniqueViewers: number;
  measured: number;
  avgWatchedSeconds: number;
  avgCompletionPct: number | null;
  finished: number;
}

interface Viewer {
  sessionId: string;
  user: { id: string; name: string | null; email: string; image: string | null };
  startedAt: string;
  watchedSeconds: number;
  completionPct: number | null;
}

export function OnDemandMetricsTab() {
  const t = useTranslations("admin.onDemand.metrics");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ videos: VideoRow[]; measuredTotal: number }>({
    queryKey: ["on-demand-metrics"],
    queryFn: async () => {
      const res = await fetch("/api/admin/on-demand/metrics");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: viewers } = useQuery<{ viewers: Viewer[] }>({
    queryKey: ["on-demand-viewers", openId],
    enabled: !!openId,
    queryFn: async () => {
      const res = await fetch(`/api/admin/on-demand/metrics?videoId=${openId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const videos = data?.videos ?? [];
  if (videos.length === 0) {
    return <p className="py-16 text-center text-sm text-muted">{t("noVideos")}</p>;
  }

  return (
    <div className="space-y-4">
      {data?.measuredTotal === 0 && (
        // Being explicit beats a wall of zeros that reads as "nobody watches".
        <p className="rounded-xl bg-muted/10 px-4 py-3 text-xs leading-relaxed text-muted">
          {t("noDataYet")}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border/60">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="px-4 py-3 font-medium">{t("video")}</th>
              <th className="px-3 py-3 text-right font-medium">{t("plays")}</th>
              <th className="px-3 py-3 text-right font-medium">{t("viewers")}</th>
              <th className="px-3 py-3 text-right font-medium">{t("avgWatched")}</th>
              <th className="px-3 py-3 text-right font-medium">{t("completion")}</th>
              <th className="px-3 py-3 text-right font-medium">{t("finished")}</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {videos.map((v) => {
              const open = openId === v.id;
              return (
                <>
                  <tr
                    key={v.id}
                    onClick={() => setOpenId(open ? null : v.id)}
                    className="cursor-pointer border-b border-border/40 transition hover:bg-muted/5"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{v.title}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {v.coachName ?? "—"}
                        {v.durationSeconds ? ` · ${formatDuration(v.durationSeconds)}` : ""}
                        {!v.published && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">
                            {t("draft")}
                          </Badge>
                        )}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{v.plays}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{v.uniqueViewers}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {v.measured > 0 ? formatDuration(v.avgWatchedSeconds) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {v.avgCompletionPct != null ? `${v.avgCompletionPct}%` : "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {v.measured > 0 ? v.finished : "—"}
                    </td>
                    <td className="pr-3 text-muted">
                      {open ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr key={`${v.id}-viewers`}>
                      <td colSpan={7} className="bg-muted/5 px-4 py-3">
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                          <Users className="h-3 w-3" />
                          {t("whoWatched")}
                        </p>
                        {!viewers ? (
                          <Skeleton className="h-20 w-full rounded-lg" />
                        ) : viewers.viewers.length === 0 ? (
                          <p className="py-3 text-xs text-muted">{t("noViewers")}</p>
                        ) : (
                          <ul className="divide-y divide-border/40">
                            {viewers.viewers.map((w) => (
                              <li
                                key={w.sessionId}
                                className="flex items-center gap-3 py-2"
                              >
                                <Avatar className="h-7 w-7">
                                  <AvatarImage src={w.user.image ?? undefined} />
                                  <AvatarFallback className="text-[10px]">
                                    {(w.user.name ?? w.user.email)
                                      .slice(0, 2)
                                      .toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-medium">
                                    {w.user.name ?? w.user.email}
                                  </p>
                                  <p className="text-[11px] text-muted">
                                    {formatDate(w.startedAt)}
                                  </p>
                                </div>
                                <span className="text-xs tabular-nums text-muted">
                                  {w.watchedSeconds > 0
                                    ? formatDuration(w.watchedSeconds)
                                    : t("notMeasured")}
                                </span>
                                <span
                                  className={cn(
                                    "w-12 text-right text-xs font-medium tabular-nums",
                                    w.completionPct != null && w.completionPct >= 90
                                      ? "text-emerald-600"
                                      : "text-muted",
                                  )}
                                >
                                  {w.completionPct != null ? `${w.completionPct}%` : "—"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-muted/70">
        <BarChart3 className="mt-0.5 h-3 w-3 shrink-0" />
        {t("footnote")}
      </p>
    </div>
  );
}
