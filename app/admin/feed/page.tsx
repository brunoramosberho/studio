"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Megaphone,
  Trophy,
  Camera,
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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useBranding } from "@/components/branding-provider";
import { cn } from "@/lib/utils";

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

const categories = [
  { key: "announcement", label: "Anuncio", icon: Megaphone, color: "bg-blue-50 text-blue-600" },
  { key: "challenge", label: "Reto", icon: Trophy, color: "bg-amber-50 text-amber-600" },
  { key: "photo", label: "Foto", icon: Camera, color: "bg-pink-50 text-pink-600" },
  { key: "motivation", label: "Motivación", icon: Sparkles, color: "bg-purple-50 text-purple-600" },
];

function getCategoryMeta(cat: string) {
  return categories.find((c) => c.key === cat) ?? categories[0];
}

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

function eventLabel(eventType: string, payload: Record<string, unknown>) {
  switch (eventType) {
    case "STUDIO_POST": {
      const cat = getCategoryMeta(payload.category as string);
      return { label: cat.label, icon: cat.icon, color: cat.color };
    }
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
  const { studioName } = useBranding();
  const [composerOpen, setComposerOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "studio_posts">("all");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("announcement");

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
        body: JSON.stringify({ title, body, category }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-feed"] });
      setTitle("");
      setBody("");
      setCategory("announcement");
      setComposerOpen(false);
    },
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
              className="fixed inset-x-4 top-[15%] z-50 mx-auto max-w-lg rounded-2xl bg-white p-6 shadow-warm-lg sm:inset-x-auto sm:w-full"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-display text-lg font-bold text-foreground">
                  Publicar como {studioName}
                </h2>
                <button
                  onClick={() => setComposerOpen(false)}
                  className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Category pills */}
                <div>
                  <label className="mb-2 block text-xs font-medium text-muted">Categoría</label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => (
                      <button
                        key={cat.key}
                        onClick={() => setCategory(cat.key)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                          category === cat.key
                            ? "ring-2 ring-admin/30 " + cat.color
                            : "bg-surface text-muted hover:text-foreground",
                        )}
                      >
                        <cat.icon className="h-3.5 w-3.5" />
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted">
                    Título (opcional)
                  </label>
                  <Input
                    placeholder="Ej: Nuevo reto de enero"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted">
                    Contenido
                  </label>
                  <textarea
                    placeholder="Escribe tu mensaje para la comunidad..."
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                    className="flex w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted/50 focus:border-admin focus:outline-none focus:ring-1 focus:ring-admin/30"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setComposerOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1 gap-2 bg-admin text-white hover:bg-admin/90"
                    disabled={!body.trim() || createMut.isPending}
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
            const meta = eventLabel(event.eventType, event.payload);
            const payload = event.payload;
            const isStudioPost = event.eventType === "STUDIO_POST";
            const postTitle = payload.title as string | null;
            const postBody = payload.body as string | null;

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
                          <AvatarFallback className="bg-admin/10 text-xs font-bold text-admin">
                            {studioName?.charAt(0) ?? "S"}
                          </AvatarFallback>
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
                            {isStudioPost ? studioName : event.user.name}
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

                        {/* Photos thumbnail */}
                        {event.photos.length > 0 && (
                          <div className="mt-2 flex gap-1.5">
                            {event.photos.slice(0, 4).map((photo) => (
                              <div
                                key={photo.id}
                                className="relative h-16 w-16 overflow-hidden rounded-lg bg-surface"
                              >
                                <img
                                  src={photo.thumbnailUrl ?? photo.url}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            ))}
                            {event.photos.length > 4 && (
                              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-surface text-xs font-medium text-muted">
                                +{event.photos.length - 4}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Metrics row */}
                        <div className="mt-2.5 flex items-center gap-4">
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
