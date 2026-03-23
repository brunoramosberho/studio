"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface CommentData {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
}

interface CommentsSheetProps {
  eventId: string;
  commentCount: number;
}

export function CommentsSheet({ eventId, commentCount }: CommentsSheetProps) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/feed/${eventId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (open) {
      fetchComments();
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open, fetchComments]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments]);

  const submit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/feed/${eventId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text.trim() }),
      });
      if (res.ok) {
        const comment = await res.json();
        setComments((prev) => [...prev, comment]);
        setText("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "ahora";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface"
      >
        <MessageCircle className="h-4 w-4" />
        {commentCount > 0 && <span>{commentCount}</span>}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setOpen(false)}
          />

          {/* Sheet — bottom sheet on mobile, inline panel on desktop */}
          <div
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 flex max-h-[70dvh] flex-col rounded-t-2xl bg-background shadow-warm-lg md:hidden",
              "animate-slide-up",
            )}
          >
            {/* Handle bar */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold text-foreground">
                Comentarios
              </span>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-muted hover:bg-surface"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Comments list */}
            <div
              ref={scrollRef}
              className="flex-1 space-y-4 overflow-y-auto px-4 py-3"
            >
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-2">
                      <div className="h-7 w-7 animate-pulse rounded-full bg-surface" />
                      <div className="flex-1 space-y-1">
                        <div className="h-3 w-20 animate-pulse rounded bg-surface" />
                        <div className="h-3 w-full animate-pulse rounded bg-surface" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : comments.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">
                  Sé el primero en comentar
                </p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex gap-2.5">
                    <Avatar className="h-7 w-7">
                      {c.user.image && <AvatarImage src={c.user.image} />}
                      <AvatarFallback className="text-[10px]">
                        {c.user.name?.charAt(0) ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-[13px]">
                        <span className="font-semibold text-foreground">
                          {c.user.name?.split(" ")[0]}{" "}
                        </span>
                        <span className="text-foreground/80">{c.body}</span>
                      </p>
                      <span className="text-[11px] text-muted">
                        {timeAgo(c.createdAt)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 border-t px-4 py-2 safe-bottom">
              <input
                ref={inputRef}
                type="text"
                className="flex-1 rounded-full bg-surface px-4 py-2.5 text-[15px] text-foreground placeholder:text-muted focus:outline-none"
                style={{ fontSize: "16px" }}
                placeholder="Agregar comentario..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <button
                onClick={submit}
                disabled={!text.trim() || submitting}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Desktop inline panel — hidden on mobile */}
          <div className="hidden md:block">
            <div className="mt-3 rounded-xl border bg-background p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  Comentarios
                </span>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-full p-1 text-muted hover:bg-surface"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-60 space-y-3 overflow-y-auto">
                {loading ? (
                  <div className="h-8 w-full animate-pulse rounded bg-surface" />
                ) : comments.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted">
                    Sé el primero en comentar
                  </p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="flex gap-2.5">
                      <Avatar className="h-7 w-7">
                        {c.user.image && <AvatarImage src={c.user.image} />}
                        <AvatarFallback className="text-[10px]">
                          {c.user.name?.charAt(0) ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-[13px]">
                          <span className="font-semibold text-foreground">
                            {c.user.name?.split(" ")[0]}{" "}
                          </span>
                          <span className="text-foreground/80">{c.body}</span>
                        </p>
                        <span className="text-[11px] text-muted">
                          {timeAgo(c.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  className="flex-1 rounded-full bg-surface px-4 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none"
                  placeholder="Agregar comentario..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
                <button
                  onClick={submit}
                  disabled={!text.trim() || submitting}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
