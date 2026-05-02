"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Plus,
  Search,
  Loader2,
  Video as VideoIcon,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UploadDialog } from "../components/upload-dialog";
import { EditVideoDialog } from "../components/edit-video-dialog";

interface VideoRow {
  id: string;
  cloudflareStreamUid: string;
  title: string;
  description: string | null;
  status: "processing" | "ready" | "errored";
  published: boolean;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  cloudflareThumbnailUrl: string | null;
  signedThumbnailUrl: string | null;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ALL";
  viewCount: number;
  errorMessage: string | null;
  createdAt: string;
  coachProfile: { id: string; name: string } | null;
  classType: { id: string; name: string } | null;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function OnDemandLibraryTab() {
  const t = useTranslations("admin.onDemand");
  const tc = useTranslations("common");
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-on-demand-videos", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      const res = await fetch(`/api/admin/on-demand/videos?${params}`);
      if (!res.ok) throw new Error("Failed");
      return (await res.json()) as { videos: VideoRow[] };
    },
    refetchInterval: (query) => {
      const videos = query.state.data?.videos ?? [];
      return videos.some((v) => v.status === "processing") ? 5_000 : false;
    },
  });

  const togglePublish = useMutation({
    mutationFn: async (params: { id: string; published: boolean }) => {
      const res = await fetch(`/api/admin/on-demand/videos/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: params.published }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-on-demand-videos"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/on-demand/videos/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-on-demand-videos"] });
    },
  });

  const videos = data?.videos ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setShowUpload(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          {t("uploadVideo")}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-lg" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <VideoIcon className="h-10 w-10 text-muted/40" />
            <p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
            <p className="max-w-sm text-xs text-muted">{t("emptyDesc")}</p>
            <Button onClick={() => setShowUpload(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              {t("uploadVideo")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => {
            const thumb = v.thumbnailUrl ?? v.signedThumbnailUrl;
            return (
              <Card key={v.id} className="overflow-hidden">
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
                  {v.status === "processing" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                      <div className="flex items-center gap-2 text-xs">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("processing")}
                      </div>
                    </div>
                  )}
                  {v.status === "errored" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-900/60 text-white">
                      <div className="flex items-center gap-2 text-xs">
                        <AlertTriangle className="h-4 w-4" />
                        {t("errored")}
                      </div>
                    </div>
                  )}
                  {v.durationSeconds && v.status === "ready" && (
                    <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
                      <Clock className="h-3 w-3" />
                      {formatDuration(v.durationSeconds)}
                    </div>
                  )}
                </div>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold text-foreground">
                        {v.title}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted">
                        {v.coachProfile?.name ?? t("noCoach")}
                        {v.classType?.name ? ` · ${v.classType.name}` : ""}
                      </p>
                    </div>
                    {v.published ? (
                      <Badge variant="default" className="shrink-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        {t("published")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 text-muted">
                        {t("draft")}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      disabled={v.status !== "ready" || togglePublish.isPending}
                      onClick={() =>
                        togglePublish.mutate({
                          id: v.id,
                          published: !v.published,
                        })
                      }
                    >
                      {v.published ? (
                        <>
                          <EyeOff className="h-3.5 w-3.5" />
                          {t("unpublish")}
                        </>
                      ) : (
                        <>
                          <Eye className="h-3.5 w-3.5" />
                          {t("publish")}
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => setEditingId(v.id)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {tc("edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (confirm(t("confirmDelete"))) remove.mutate(v.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <UploadDialog
        open={showUpload}
        onOpenChange={setShowUpload}
        onUploaded={() => {
          qc.invalidateQueries({ queryKey: ["admin-on-demand-videos"] });
        }}
      />
      {editingId && (
        <EditVideoDialog
          videoId={editingId}
          open={!!editingId}
          onOpenChange={(o) => !o && setEditingId(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin-on-demand-videos"] });
          }}
        />
      )}
    </div>
  );
}
