"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, UserPlus, Check, X, Loader2, Search } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/shared/page-transition";
import { cn } from "@/lib/utils";

interface Friend {
  id: string;
  name: string | null;
  image: string | null;
  email: string | null;
  friendshipId: string;
}

interface PendingRequest {
  friendshipId: string;
  id: string;
  name: string | null;
  image: string | null;
  sentAt: string;
}

interface Suggestion {
  id: string;
  name: string | null;
  image: string | null;
  mutualClasses: number;
}

export default function FriendsPage() {
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<PendingRequest[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/friends").then((r) => r.json()),
      fetch("/api/friends/suggestions").then((r) => r.json()),
    ])
      .then(([data, sug]) => {
        setFriends(data.friends ?? []);
        setPending(data.pendingRequests ?? []);
        setSentRequests(data.sentRequests ?? []);
        setSuggestions(sug ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleAccept(friendshipId: string) {
    const res = await fetch(`/api/friends/${friendshipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    if (res.ok) {
      const req = pending.find((p) => p.friendshipId === friendshipId);
      setPending((prev) => prev.filter((p) => p.friendshipId !== friendshipId));
      if (req) {
        setFriends((prev) => [
          { id: req.id, name: req.name, image: req.image, email: null, friendshipId },
          ...prev,
        ]);
      }
    }
  }

  async function handleDecline(friendshipId: string) {
    const res = await fetch(`/api/friends/${friendshipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decline" }),
    });
    if (res.ok) {
      setPending((prev) => prev.filter((p) => p.friendshipId !== friendshipId));
    }
  }

  async function handleCancelSent(friendshipId: string) {
    const res = await fetch(`/api/friends/${friendshipId}`, { method: "DELETE" });
    if (res.ok) {
      setSentRequests((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
    }
  }

  async function handleRemove(friendshipId: string) {
    const res = await fetch(`/api/friends/${friendshipId}`, { method: "DELETE" });
    if (res.ok) {
      setFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
    }
  }

  async function handleSendRequest(userId: string) {
    setSent((prev) => new Set(prev).add(userId));
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: userId }),
    });
    if (res.ok || res.status === 409) {
      setSuggestions((prev) => prev.filter((s) => s.id !== userId));
    }
  }

  const q = search.toLowerCase().trim();
  const matchName = (name: string | null) => !q || (name?.toLowerCase().includes(q) ?? false);
  const filteredFriends = friends.filter((f) => matchName(f.name));
  const filteredPending = pending.filter((r) => matchName(r.name));
  const filteredSent = sentRequests.filter((r) => matchName(r.name));
  const filteredSuggestions = suggestions.filter((s) => matchName(s.name));

  return (
    <PageTransition>
      <div className="pb-24">
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted active:bg-surface"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-display text-xl font-bold text-foreground">
            Amigos
          </h1>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre..."
            className="h-11 w-full rounded-2xl border border-border/50 bg-white pl-10 pr-4 text-[14px] text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Pending requests */}
            {filteredPending.length > 0 && (
              <section>
                <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-muted">
                  Solicitudes pendientes
                </h2>
                <div className="space-y-2">
                  {filteredPending.map((req) => (
                    <div
                      key={req.friendshipId}
                      className="flex items-center gap-3 rounded-2xl border border-border/50 bg-white px-4 py-3"
                    >
                      <Link href={`/my/user/${req.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar className="h-11 w-11">
                          {req.image && <AvatarImage src={req.image} />}
                          <AvatarFallback className="text-sm">
                            {req.name?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold text-foreground">
                            {req.name}
                          </p>
                          <p className="text-[12px] text-muted">
                            Quiere ser tu amigo/a
                          </p>
                        </div>
                      </Link>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAccept(req.friendshipId)}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white active:opacity-80"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDecline(req.friendshipId)}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted active:opacity-80"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Sent requests */}
            {filteredSent.length > 0 && (
              <section>
                <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-muted">
                  Solicitudes enviadas
                </h2>
                <div className="space-y-2">
                  {filteredSent.map((req) => (
                    <div
                      key={req.friendshipId}
                      className="flex items-center gap-3 rounded-2xl border border-border/50 bg-white px-4 py-3"
                    >
                      <Link href={`/my/user/${req.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar className="h-11 w-11">
                          {req.image && <AvatarImage src={req.image} />}
                          <AvatarFallback className="text-sm">
                            {req.name?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold text-foreground">
                            {req.name}
                          </p>
                          <p className="text-[12px] text-muted">
                            Pendiente
                          </p>
                        </div>
                      </Link>
                      <button
                        onClick={() => handleCancelSent(req.friendshipId)}
                        className="rounded-full bg-red-50 px-3 py-1.5 text-[12px] font-semibold text-red-600 transition-colors hover:bg-red-100 active:scale-95"
                      >
                        Cancelar
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Friends list */}
            <section>
              <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-muted">
                Tus amigos ({filteredFriends.length})
              </h2>
              {filteredFriends.length === 0 ? (
                <div className="rounded-2xl border border-border/50 bg-white py-12 text-center">
                  <span className="text-3xl">👋</span>
                  <p className="mt-3 text-[14px] font-medium text-foreground">
                    Aún no tienes amigos
                  </p>
                  <p className="mt-1 text-[13px] text-muted">
                    Agrega personas del estudio
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredFriends.map((f) => (
                    <div
                      key={f.friendshipId}
                      className="flex items-center gap-3 rounded-2xl border border-border/50 bg-white px-4 py-3"
                    >
                      <Link href={`/my/user/${f.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar className="h-11 w-11">
                          {f.image && <AvatarImage src={f.image} />}
                          <AvatarFallback className="text-sm">
                            {f.name?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <p className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">
                          {f.name}
                        </p>
                      </Link>
                      <button
                        onClick={() => handleRemove(f.friendshipId)}
                        className="rounded-full px-3 py-1.5 text-[12px] font-medium text-muted active:bg-surface hover:text-destructive"
                      >
                        Eliminar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Suggestions */}
            {filteredSuggestions.length > 0 && (
              <section>
                <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-muted">
                  Personas del estudio
                </h2>
                <div className="space-y-1.5">
                  {filteredSuggestions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 rounded-2xl border border-border/50 bg-white px-4 py-3"
                    >
                      <Link href={`/my/user/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar className="h-11 w-11">
                          {s.image && <AvatarImage src={s.image} />}
                          <AvatarFallback className="text-sm">
                            {s.name?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-medium text-foreground">
                            {s.name}
                          </p>
                          {s.mutualClasses > 0 && (
                            <p className="text-[12px] text-muted">
                              {s.mutualClasses} clase{s.mutualClasses > 1 ? "s" : ""} en común
                            </p>
                          )}
                        </div>
                      </Link>
                      <Button
                        size="sm"
                        variant={sent.has(s.id) ? "ghost" : "secondary"}
                        className={cn(
                          "h-8 gap-1.5 text-[12px]",
                          sent.has(s.id) && "text-accent",
                        )}
                        disabled={sent.has(s.id)}
                        onClick={() => handleSendRequest(s.id)}
                      >
                        {sent.has(s.id) ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Enviada
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-3.5 w-3.5" />
                            Agregar
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
