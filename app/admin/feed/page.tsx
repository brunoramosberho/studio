"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Megaphone,
  Trophy,
  Sparkles,
  Pin,
  PinOff,
  Trash2,
  Heart,
  MessageCircle,
  Send,
  Loader2,
  Plus,
  X,
  Image as ImageIcon,
  Bell,
  MapPin,
  Globe,
  Instagram,
  Check,
  Play,
  Calendar,
  Search,
  ArrowRight,
  Clock,
  Dumbbell,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useSession } from "next-auth/react";
import { useBranding } from "@/components/branding-provider";
import { getIconComponent } from "@/components/admin/icon-picker";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface LinkedClassOption {
  id: string;
  startsAt: string;
  endsAt: string;
  classType: {
    name: string;
    color: string;
    icon: string | null;
  };
  coach: {
    id: string;
    userId: string;
    user: { name: string | null; image: string | null };
  };
  room: {
    name: string;
    studio: { name: string };
  };
}

interface CityOption {
  id: string;
  name: string;
  countryCode: string;
}

interface FeedItem {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  visibility: string;
  isPinned: boolean;
  createdAt: string;
  user: { id: true; name: string | null; image: string | null };
  photos: { id: string; url: string; thumbnailUrl?: string | null; mimeType: string }[];
  likeCount: number;
  commentCount: number;
}

interface FeedPage {
  feed: FeedItem[];
  nextCursor: string | null;
}

type IgStatus = {
  connected: boolean;
  igUserId?: string;
  igUsername?: string | null;
  expiresAt?: string | null;
  updatedAt?: string;
};

type IgMediaItem = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function eventLabel(eventType: string) {
  switch (eventType) {
    case "STUDIO_POST":
      return { label: "Publicación", icon: Megaphone, color: "bg-admin/10 text-admin" };
    case "CLASS_COMPLETED":
      return { label: "Clase completada", icon: Trophy, color: "bg-green-50 text-green-600" };
    case "CLASS_RESERVED":
      return { label: "Reserva", icon: Megaphone, color: "bg-sky-50 text-sky-600" };
    case "ACHIEVEMENT_UNLOCKED":
      return { label: "Logro", icon: Sparkles, color: "bg-violet-50 text-violet-600" };
    default:
      return { label: eventType, icon: Megaphone, color: "bg-gray-50 text-gray-600" };
  }
}

export default function AdminFeedPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { studioName, appIconUrl } = useBranding();
  const [composerOpen, setComposerOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "studio_posts">("all");
  const [igPickerOpen, setIgPickerOpen] = useState(false);
  const [selectedIg, setSelectedIg] = useState<Record<string, boolean>>({});

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetCityIds, setTargetCityIds] = useState<string[]>([]);
  const [sendPush, setSendPush] = useState(false);
  const [postAsAdmin, setPostAsAdmin] = useState(false);
  const [pinPost, setPinPost] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [linkedClass, setLinkedClass] = useState<LinkedClassOption | null>(null);
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [classSearch, setClassSearch] = useState("");

  const addMediaFiles = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files);
    setMediaFiles((prev) => [...prev, ...newFiles]);
    const newPreviews = newFiles.map((f) => URL.createObjectURL(f));
    setMediaPreviews((prev) => [...prev, ...newPreviews]);
  };

  const removeMediaFile = (index: number) => {
    URL.revokeObjectURL(mediaPreviews[index]);
    setMediaFiles((prev) => prev.filter((_, i) => i !== index));
    setMediaPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const clearMedia = () => {
    mediaPreviews.forEach((url) => URL.revokeObjectURL(url));
    setMediaFiles([]);
    setMediaPreviews([]);
  };

  const { data: cities } = useQuery<CityOption[]>({
    queryKey: ["feed-cities"],
    queryFn: async () => {
      const res = await fetch("/api/locations");
      if (!res.ok) return [];
      const countries = await res.json();
      return countries.flatMap((c: { code: string; cities: { id: string; name: string }[] }) =>
        c.cities.map((city: { id: string; name: string }) => ({
          id: city.id,
          name: city.name,
          countryCode: c.code,
        })),
      );
    },
  });

  const { data: igStatus } = useQuery<IgStatus>({
    queryKey: ["ig-status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/instagram/status");
      if (!res.ok) return { connected: false };
      return res.json();
    },
  });

  const { data: igMedia, isLoading: igMediaLoading } = useQuery<{
    igUsername: string | null;
    items: IgMediaItem[];
  }>({
    queryKey: ["ig-media", igPickerOpen],
    enabled: !!igStatus?.connected && igPickerOpen,
    queryFn: async () => {
      const res = await fetch("/api/admin/instagram/media?limit=24");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: upcomingClasses, isLoading: classesLoading } = useQuery<LinkedClassOption[]>({
    queryKey: ["upcoming-classes-picker", classPickerOpen],
    enabled: classPickerOpen,
    queryFn: async () => {
      const from = new Date().toISOString();
      const res = await fetch(`/api/classes?from=${encodeURIComponent(from)}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const filteredClasses = useMemo(() => {
    if (!upcomingClasses) return [];
    if (!classSearch.trim()) return upcomingClasses;
    const q = classSearch.toLowerCase();
    return upcomingClasses.filter(
      (c) =>
        c.classType.name.toLowerCase().includes(q) ||
        c.coach.user.name?.toLowerCase().includes(q) ||
        c.room.studio.name.toLowerCase().includes(q),
    );
  }, [upcomingClasses, classSearch]);

  const igItems = useMemo(() => igMedia?.items ?? [], [igMedia?.items]);
  const selectedIds = useMemo(
    () => Object.keys(selectedIg).filter((k) => selectedIg[k]),
    [selectedIg],
  );

  useEffect(() => {
    if (!igPickerOpen) setSelectedIg({});
  }, [igPickerOpen]);

  const importIgMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/instagram/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaIds: selectedIds }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data: { createdCount: number; skippedExistingCount: number }) => {
      toast.success(
        `Importados ${data.createdCount} post${data.createdCount === 1 ? "" : "s"} de Instagram` +
          (data.skippedExistingCount > 0 ? ` · ${data.skippedExistingCount} ya existían` : ""),
      );
      setIgPickerOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-feed"] });
    },
    onError: () => toast.error("No se pudo importar desde Instagram"),
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["admin-feed", filter],
    queryFn: async ({ pageParam }) => {
      const url = new URL("/api/admin/feed", window.location.origin);
      url.searchParams.set("limit", "30");
      if (filter !== "all") url.searchParams.set("filter", filter);
      if (pageParam) url.searchParams.set("cursor", pageParam);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<FeedPage>;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          targetCityIds: targetCityIds.length > 0 ? targetCityIds : null,
          sendPush,
          postAsAdmin,
          isPinned: pinPost,
          linkedClassId: linkedClass?.id ?? null,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const event = await res.json();

      let uploadedCount = 0;
      let failedCount = 0;

      if (mediaFiles.length > 0) {
        for (const file of mediaFiles) {
          try {
            const fd = new FormData();
            fd.append("file", file);
            const uploadRes = await fetch(`/api/feed/${event.id}/photos`, {
              method: "POST",
              body: fd,
            });
            if (uploadRes.ok) {
              uploadedCount++;
            } else {
              const err = await uploadRes.json().catch(() => ({}));
              console.error("Upload failed:", file.name, err);
              failedCount++;
            }
          } catch (err) {
            console.error("Upload error:", file.name, err);
            failedCount++;
          }
        }
      }

      return { event, uploadedCount, failedCount };
    },
    onSuccess: ({ uploadedCount, failedCount }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-feed"] });
      setTitle("");
      setBody("");
      setTargetCityIds([]);
      setSendPush(false);
      setPostAsAdmin(false);
      setPinPost(false);
      setLinkedClass(null);
      clearMedia();
      setComposerOpen(false);

      if (failedCount > 0 && uploadedCount > 0) {
        toast.warning(`Publicación creada · ${failedCount} archivo${failedCount > 1 ? "s" : ""} no se pudo subir`);
      } else if (failedCount > 0) {
        toast.warning(`Publicación creada pero los archivos no se pudieron subir`);
      } else {
        toast.success("Publicación creada");
      }
    },
    onError: () => toast.error("No se pudo crear la publicación"),
  });

  const pinMut = useMutation({
    mutationFn: async ({ id, pin }: { id: string; pin: boolean }) => {
      const res = await fetch(`/api/admin/feed/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: pin }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-feed"] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/feed/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-feed"] }),
  });

  const allEvents = data?.pages.flatMap((p) => p.feed) ?? [];

  const totalLikes = allEvents.reduce((s, e) => s + e.likeCount, 0);
  const totalComments = allEvents.reduce((s, e) => s + e.commentCount, 0);
  const studioPosts = allEvents.filter((e) => e.eventType === "STUDIO_POST").length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Feed del Estudio</h1>
          <p className="mt-1 text-sm text-muted">
            Publica como {studioName} y gestiona el contenido del feed
          </p>
        </div>
        <Button
          onClick={() => setComposerOpen(true)}
          className="gap-2 bg-admin text-white hover:bg-admin/90"
        >
          <Plus className="h-4 w-4" />
          Nueva publicación
        </Button>
      </div>

      {/* Instagram import */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50">
              <Instagram className="h-5 w-5 text-pink-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Instagram</p>
              <p className="text-xs text-muted">
                {igStatus?.connected
                  ? `Conectado${igStatus.igUsername ? ` como @${igStatus.igUsername}` : ""}`
                  : "Conecta tu cuenta para importar posts al feed"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!igStatus?.connected ? (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => (window.location.href = "/api/admin/instagram/connect")}
              >
                <Instagram className="h-4 w-4" />
                Conectar
              </Button>
            ) : (
              <Button
                className="gap-2 bg-admin text-white hover:bg-admin/90"
                onClick={() => setIgPickerOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Importar posts
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-admin/10">
              <Send className="h-5 w-5 text-admin" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-foreground">{studioPosts}</p>
              <p className="text-xs text-muted">Publicaciones</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50">
              <Heart className="h-5 w-5 text-pink-500" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-foreground">{totalLikes}</p>
              <p className="text-xs text-muted">Likes totales</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
              <MessageCircle className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-foreground">{totalComments}</p>
              <p className="text-xs text-muted">Comentarios</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-xl bg-surface p-1">
        {[
          { key: "all" as const, label: "Todo el feed" },
          { key: "studio_posts" as const, label: "Publicaciones del estudio" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              "flex-1 rounded-lg py-2 text-[13px] font-medium transition-all",
              filter === tab.key
                ? "bg-white text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Composer modal */}
      <AnimatePresence>
        {igPickerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm"
              onClick={() => setIgPickerOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[10%] z-50 mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-warm-lg sm:inset-x-auto sm:w-full"
            >
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-foreground">
                    Importar de Instagram
                  </h2>
                  <p className="mt-0.5 text-sm text-muted">
                    Selecciona posts para publicarlos en el feed como {studioName}
                  </p>
                </div>
                <button
                  onClick={() => setIgPickerOpen(false)}
                  className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {igMediaLoading ? (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} className="aspect-square rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted">
                      {igMedia?.igUsername ? `@${igMedia.igUsername}` : "Cuenta conectada"}
                    </p>
                    <p className="text-xs text-muted">
                      {selectedIds.length} seleccionados
                    </p>
                  </div>
                  <div className="max-h-[55dvh] overflow-auto pr-1">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {igItems.map((it) => {
                        const img =
                          it.media_type === "VIDEO"
                            ? it.thumbnail_url ?? it.media_url
                            : it.media_url;
                        const selected = !!selectedIg[it.id];
                        return (
                          <button
                            type="button"
                            key={it.id}
                            onClick={() =>
                              setSelectedIg((prev) => ({ ...prev, [it.id]: !prev[it.id] }))
                            }
                            className={cn(
                              "group relative overflow-hidden rounded-xl border bg-surface text-left",
                              selected ? "border-admin ring-2 ring-admin/20" : "border-border",
                            )}
                          >
                            <div className="aspect-square bg-surface">
                              {img ? (
                                <img
                                  src={img}
                                  alt=""
                                  className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                                  Sin media
                                </div>
                              )}
                            </div>
                            <div className="absolute left-2 top-2 flex items-center gap-1">
                              {selected && (
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-admin text-white">
                                  <Check className="h-4 w-4" />
                                </span>
                              )}
                            </div>
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                              <p className="line-clamp-2 text-xs text-white/90">
                                {(it.caption ?? "").trim() || "Post de Instagram"}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-1">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setIgPickerOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1 gap-2 bg-admin text-white hover:bg-admin/90"
                      disabled={selectedIds.length === 0 || importIgMut.isPending}
                      onClick={() => importIgMut.mutate()}
                    >
                      {importIgMut.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Instagram className="h-4 w-4" />
                      )}
                      Importar
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}

        {composerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm"
              onClick={() => setComposerOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[5%] z-50 mx-auto max-w-lg rounded-2xl bg-white shadow-warm-lg sm:inset-x-auto sm:w-full"
            >
              <div className="max-h-[90dvh] overflow-y-auto p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-display text-lg font-bold text-foreground">
                    Nueva publicación
                  </h2>
                  <button
                    onClick={() => setComposerOpen(false)}
                    className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Post-as selector — compact inline */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPostAsAdmin(false)}
                      className={cn(
                        "flex flex-1 items-center gap-2.5 rounded-xl border p-2.5 transition-all",
                        !postAsAdmin
                          ? "border-admin bg-admin/5 ring-2 ring-admin/20"
                          : "border-border hover:border-admin/30",
                      )}
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        {appIconUrl ? <AvatarImage src={appIconUrl} /> : null}
                        <AvatarFallback className="bg-admin/10 text-xs font-bold text-admin">
                          {studioName?.charAt(0) ?? "S"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 text-left">
                        <p className={cn("text-sm font-semibold truncate", !postAsAdmin ? "text-admin" : "text-foreground")}>
                          {studioName}
                        </p>
                        <p className="text-[11px] text-muted">Estudio</p>
                      </div>
                    </button>
                    <button
                      onClick={() => setPostAsAdmin(true)}
                      className={cn(
                        "flex flex-1 items-center gap-2.5 rounded-xl border p-2.5 transition-all",
                        postAsAdmin
                          ? "border-admin bg-admin/5 ring-2 ring-admin/20"
                          : "border-border hover:border-admin/30",
                      )}
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        {session?.user?.image ? <AvatarImage src={session.user.image} /> : null}
                        <AvatarFallback className="bg-surface text-xs font-bold text-foreground">
                          {session?.user?.name?.charAt(0) ?? "A"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 text-left">
                        <p className={cn("text-sm font-semibold truncate", postAsAdmin ? "text-admin" : "text-foreground")}>
                          {session?.user?.name ?? "Admin"}
                        </p>
                        <p className="text-[11px] text-muted">Admin</p>
                      </div>
                    </button>
                  </div>

                  {/* Content textarea — primary input */}
                  <textarea
                    placeholder="Escribe tu mensaje para la comunidad..."
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                    className="flex w-full rounded-xl border border-border bg-white px-3.5 py-3 text-sm text-foreground transition-colors placeholder:text-muted/50 focus:border-admin focus:outline-none focus:ring-1 focus:ring-admin/30 resize-none"
                  />

                  {/* Title (optional) */}
                  <Input
                    placeholder="Título (opcional)"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />

                  {/* Media section */}
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addMediaFiles(e.target.files);
                      if (mediaInputRef.current) mediaInputRef.current.value = "";
                    }}
                  />

                  {mediaPreviews.length > 0 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        {mediaPreviews.map((src, i) => (
                          <div key={i} className="group relative aspect-square overflow-hidden rounded-xl bg-surface">
                            {mediaFiles[i]?.type.startsWith("video/") ? (
                              <video src={src} className="h-full w-full object-cover" muted />
                            ) : (
                              <img src={src} alt="" className="h-full w-full object-cover" />
                            )}
                            <button
                              onClick={() => removeMediaFile(i)}
                              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => mediaInputRef.current?.click()}
                          className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-border text-muted transition-colors hover:border-admin/40 hover:text-admin"
                        >
                          <Plus className="h-6 w-6" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => mediaInputRef.current?.click()}
                      className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border p-3 text-left transition-colors hover:border-admin/40 hover:bg-admin/5"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface">
                        <ImageIcon className="h-4.5 w-4.5 text-muted" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Agregar fotos o videos</p>
                        <p className="text-[11px] text-muted">JPG, PNG, MP4...</p>
                      </div>
                    </button>
                  )}

                  {/* Audience selector */}
                  {(cities?.length ?? 0) > 0 && (
                    <div>
                      <label className="mb-2 block text-xs font-medium text-muted">
                        <MapPin className="mr-1 inline h-3.5 w-3.5" />
                        Audiencia
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setTargetCityIds([])}
                          className={cn(
                            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                            targetCityIds.length === 0
                              ? "bg-admin/10 text-admin ring-2 ring-admin/20"
                              : "bg-surface text-muted hover:text-foreground",
                          )}
                        >
                          <Globe className="h-3.5 w-3.5" />
                          Todas las ciudades
                        </button>
                        {cities?.map((city) => (
                          <button
                            key={city.id}
                            onClick={() => {
                              setTargetCityIds((prev) =>
                                prev.includes(city.id)
                                  ? prev.filter((id) => id !== city.id)
                                  : [...prev, city.id],
                              );
                            }}
                            className={cn(
                              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                              targetCityIds.includes(city.id)
                                ? "bg-admin/10 text-admin ring-2 ring-admin/20"
                                : "bg-surface text-muted hover:text-foreground",
                            )}
                          >
                            {city.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Push notification toggle */}
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-surface/50">
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg",
                      sendPush ? "bg-admin/10" : "bg-surface",
                    )}>
                      <Bell className={cn("h-4.5 w-4.5", sendPush ? "text-admin" : "text-muted")} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Enviar push notification</p>
                      <p className="text-[11px] text-muted">
                        {targetCityIds.length === 0
                          ? "Se enviará a todos los miembros"
                          : `Se enviará a miembros en ${targetCityIds.length} ciudad${targetCityIds.length !== 1 ? "es" : ""}`}
                      </p>
                    </div>
                    <div className={cn(
                      "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                      sendPush ? "bg-admin" : "bg-border",
                    )}>
                      <div className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                        sendPush ? "translate-x-5" : "translate-x-0.5",
                      )} />
                    </div>
                    <input
                      type="checkbox"
                      checked={sendPush}
                      onChange={(e) => setSendPush(e.target.checked)}
                      className="sr-only"
                    />
                  </label>

                  {/* Pin toggle */}
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-surface/50">
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg",
                      pinPost ? "bg-admin/10" : "bg-surface",
                    )}>
                      <Pin className={cn("h-4.5 w-4.5", pinPost ? "text-admin" : "text-muted")} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Fijar publicación</p>
                      <p className="text-[11px] text-muted">
                        Aparecerá siempre arriba del feed
                      </p>
                    </div>
                    <div className={cn(
                      "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                      pinPost ? "bg-admin" : "bg-border",
                    )}>
                      <div className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                        pinPost ? "translate-x-5" : "translate-x-0.5",
                      )} />
                    </div>
                    <input
                      type="checkbox"
                      checked={pinPost}
                      onChange={(e) => setPinPost(e.target.checked)}
                      className="sr-only"
                    />
                  </label>

                  {/* Link class */}
                  {linkedClass ? (
                    <div className="rounded-xl border p-3" style={{ borderColor: `${linkedClass.classType.color}30`, backgroundColor: `${linkedClass.classType.color}08` }}>
                      <div className="flex items-start gap-3">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                          style={{ backgroundColor: `${linkedClass.classType.color}18` }}
                        >
                          {(() => {
                            const Icon = linkedClass.classType.icon ? getIconComponent(linkedClass.classType.icon) : null;
                            return Icon ? (
                              <Icon className="h-5 w-5" style={{ color: linkedClass.classType.color }} />
                            ) : (
                              <Dumbbell className="h-5 w-5" style={{ color: linkedClass.classType.color }} />
                            );
                          })()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground">{linkedClass.classType.name}</p>
                          <p className="text-[11px] text-muted">
                            con {linkedClass.coach.user.name} · {new Date(linkedClass.startsAt).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })} · {new Date(linkedClass.startsAt).toLocaleTimeString("es-ES", { hour: "numeric", minute: "2-digit", hour12: true })}
                          </p>
                          <p className="text-[11px] text-muted/70">
                            {linkedClass.room.name} · {linkedClass.room.studio.name}
                          </p>
                        </div>
                        <button
                          onClick={() => setLinkedClass(null)}
                          className="rounded-lg p-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setClassPickerOpen(true)}
                      className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border p-3 text-left transition-colors hover:border-admin/40 hover:bg-admin/5"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface">
                        <Calendar className="h-4.5 w-4.5 text-muted" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Vincular una clase</p>
                        <p className="text-[11px] text-muted">Agrega un CTA para reservar directamente</p>
                      </div>
                    </button>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3 pt-1">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setComposerOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1 gap-2 bg-admin text-white hover:bg-admin/90"
                      disabled={(!body.trim() && mediaFiles.length === 0 && !linkedClass) || createMut.isPending}
                      onClick={() => createMut.mutate()}
                    >
                      {createMut.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Publicar
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
        {classPickerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-foreground/20 backdrop-blur-sm"
              onClick={() => { setClassPickerOpen(false); setClassSearch(""); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[8%] z-[60] mx-auto max-w-lg rounded-2xl bg-white p-5 shadow-warm-lg sm:inset-x-auto sm:w-full"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-foreground">Seleccionar clase</h3>
                <button
                  onClick={() => { setClassPickerOpen(false); setClassSearch(""); }}
                  className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Buscar por disciplina, coach o estudio..."
                  value={classSearch}
                  onChange={(e) => setClassSearch(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted/50 focus:border-admin focus:outline-none focus:ring-1 focus:ring-admin/30"
                  autoFocus
                />
              </div>

              <div className="max-h-[60dvh] space-y-1 overflow-y-auto">
                {classesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted" />
                  </div>
                ) : filteredClasses.length === 0 ? (
                  <div className="py-12 text-center">
                    <Calendar className="mx-auto h-8 w-8 text-muted/30" />
                    <p className="mt-2 text-sm text-muted">
                      {classSearch ? "Sin resultados" : "No hay clases próximas"}
                    </p>
                  </div>
                ) : (
                  filteredClasses.map((cls) => {
                    const clsDate = new Date(cls.startsAt);
                    const Icon = cls.classType.icon ? getIconComponent(cls.classType.icon) : null;
                    return (
                      <button
                        key={cls.id}
                        onClick={() => {
                          setLinkedClass(cls);
                          setClassPickerOpen(false);
                          setClassSearch("");
                        }}
                        className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-surface"
                      >
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                          style={{ backgroundColor: `${cls.classType.color}18` }}
                        >
                          {Icon ? (
                            <Icon className="h-5 w-5" style={{ color: cls.classType.color }} />
                          ) : (
                            <Dumbbell className="h-5 w-5" style={{ color: cls.classType.color }} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground">{cls.classType.name}</p>
                          <p className="text-[11px] text-muted">
                            con {cls.coach.user.name} · {cls.room.studio.name}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs font-medium text-foreground">
                            {clsDate.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}
                          </p>
                          <p className="text-[11px] text-muted">
                            {clsDate.toLocaleTimeString("es-ES", { hour: "numeric", minute: "2-digit", hour12: true })}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Feed list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : allEvents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Megaphone className="h-12 w-12 text-muted/30" />
            <p className="mt-4 font-display text-lg font-semibold text-foreground">
              Feed vacío
            </p>
            <p className="mt-1 text-sm text-muted">
              {filter === "studio_posts"
                ? "Aún no has publicado nada como estudio"
                : "No hay actividad en el feed"}
            </p>
            <Button
              onClick={() => setComposerOpen(true)}
              className="mt-6 gap-2 bg-admin text-white hover:bg-admin/90"
            >
              <Plus className="h-4 w-4" />
              Primera publicación
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {allEvents.map((event) => {
            const meta = eventLabel(event.eventType);
            const payload = event.payload;
            const isStudioPost = event.eventType === "STUDIO_POST";
            const postTitle = payload.title as string | null;
            const postBody = payload.body as string | null;
            const authorName = (payload.authorName as string) ?? studioName;
            const authorImage = (payload.authorImage as string | null) ?? appIconUrl;

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card className={cn(event.isPinned && "ring-2 ring-admin/20")}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <Avatar className="h-10 w-10 shrink-0">
                        {isStudioPost ? (
                          <>
                            {authorImage && <AvatarImage src={authorImage} />}
                            <AvatarFallback className="bg-admin/10 text-xs font-bold text-admin">
                              {authorName?.charAt(0) ?? "S"}
                            </AvatarFallback>
                          </>
                        ) : (
                          <>
                            {event.user.image && <AvatarImage src={event.user.image as string} />}
                            <AvatarFallback className="text-xs">
                              {(event.user.name as string)?.charAt(0)}
                            </AvatarFallback>
                          </>
                        )}
                      </Avatar>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {isStudioPost ? authorName : event.user.name}
                          </span>
                          <Badge className={cn("text-[10px]", meta.color)}>
                            <meta.icon className="mr-1 h-3 w-3" />
                            {meta.label}
                          </Badge>
                          {event.isPinned && (
                            <Badge className="bg-admin/10 text-[10px] text-admin">
                              <Pin className="mr-1 h-3 w-3" />
                              Fijado
                            </Badge>
                          )}
                          <span className="ml-auto text-[11px] text-muted/60">
                            {timeAgo(event.createdAt)}
                          </span>
                        </div>

                        {isStudioPost ? (
                          <div className="mt-1.5">
                            {postTitle && (
                              <p className="text-sm font-semibold text-foreground">{postTitle}</p>
                            )}
                            {postBody && (
                              <p className="mt-0.5 text-sm text-muted whitespace-pre-line">{postBody}</p>
                            )}
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-muted">
                            {event.eventType === "CLASS_COMPLETED" && (
                              <>
                                {(payload.className as string) ?? "Clase"} con{" "}
                                {(payload.coachName as string) ?? "coach"} ·{" "}
                                {(payload.attendeeCount as number) ?? 0} asistentes
                              </>
                            )}
                            {event.eventType === "CLASS_RESERVED" && (
                              <>
                                {event.user.name} reservó{" "}
                                {(payload.className as string) ?? "una clase"}
                              </>
                            )}
                            {event.eventType === "ACHIEVEMENT_UNLOCKED" && (
                              <>
                                {(payload.label as string) ?? "Logro desbloqueado"}
                              </>
                            )}
                          </p>
                        )}

                        {/* Media thumbnails */}
                        {event.photos.length > 0 && (
                          <div className="mt-2 flex gap-1.5">
                            {event.photos.slice(0, 4).map((photo) => (
                              <div
                                key={photo.id}
                                className="relative h-16 w-16 overflow-hidden rounded-lg bg-surface"
                              >
                                {photo.mimeType?.startsWith("video/") ? (
                                  <>
                                    <video
                                      src={photo.url}
                                      className="h-full w-full object-cover"
                                      muted
                                      playsInline
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                      <Play className="h-5 w-5 text-white drop-shadow" />
                                    </div>
                                  </>
                                ) : (
                                  <img
                                    src={photo.thumbnailUrl ?? photo.url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                )}
                              </div>
                            ))}
                            {event.photos.length > 4 && (
                              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-surface text-xs font-medium text-muted">
                                +{event.photos.length - 4}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Linked class indicator */}
                        {isStudioPost && !!payload.linkedClassId && (
                          <div className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px]" style={{ backgroundColor: `${(payload.classTypeColor as string) ?? "#6366f1"}12` }}>
                            <Calendar className="h-3 w-3" style={{ color: (payload.classTypeColor as string) ?? "#6366f1" }} />
                            <span className="font-medium" style={{ color: (payload.classTypeColor as string) ?? "#6366f1" }}>
                              {payload.className as string}
                            </span>
                            <span className="text-muted/60">·</span>
                            <span className="text-muted/70">
                              {payload.classStartsAt ? new Date(payload.classStartsAt as string).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : ""}
                            </span>
                            {!!payload.classStartsAt && new Date(payload.classStartsAt as string).getTime() < Date.now() && (
                              <span className="ml-auto text-[10px] text-muted/50">Pasada</span>
                            )}
                          </div>
                        )}

                        {/* Audience + Metrics row */}
                        {isStudioPost && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 text-muted/60" />
                            <span className="text-[11px] text-muted/70">
                              {(payload.targetCityIds as string[] | null)
                                ? `${(payload.targetCityIds as string[]).length} ciudad${(payload.targetCityIds as string[]).length !== 1 ? "es" : ""}`
                                : "Todas las ciudades"}
                            </span>
                            {!!payload.sentPush && (
                              <>
                                <span className="text-muted/30">·</span>
                                <Bell className="h-3 w-3 text-muted/60" />
                                <span className="text-[11px] text-muted/70">Push enviado</span>
                              </>
                            )}
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-4">
                          <span className="flex items-center gap-1 text-xs text-muted">
                            <Heart className="h-3.5 w-3.5" />
                            {event.likeCount}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted">
                            <MessageCircle className="h-3.5 w-3.5" />
                            {event.commentCount}
                          </span>
                          {event.photos.length > 0 && (
                            <span className="flex items-center gap-1 text-xs text-muted">
                              <ImageIcon className="h-3.5 w-3.5" />
                              {event.photos.length}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          onClick={() => pinMut.mutate({ id: event.id, pin: !event.isPinned })}
                          className={cn(
                            "rounded-lg p-1.5 transition-colors",
                            event.isPinned
                              ? "text-admin hover:bg-admin/10"
                              : "text-muted hover:bg-surface hover:text-foreground",
                          )}
                          title={event.isPinned ? "Desfijar" : "Fijar arriba del feed"}
                        >
                          {event.isPinned ? (
                            <PinOff className="h-4 w-4" />
                          ) : (
                            <Pin className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("¿Eliminar este post del feed?")) {
                              deleteMut.mutate(event.id);
                            }
                          }}
                          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}

          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Cargar más
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
