"use client";

import { useState, useRef, useCallback } from "react";
import { MessageCircle, Send } from "lucide-react";
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

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function CommentsSheet({ eventId, commentCount }: CommentsSheetProps) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [displayCount, setDisplayCount] = useState(commentCount);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchComments = useCallback(async () => {
    if (fetched) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/feed/${eventId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
        setDisplayCount(data.length);
      }
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, [eventId, fetched]);

  const toggle = () => {
    if (!expanded) fetchComments();
    setExpanded(!expanded);
    if (!expanded) setTimeout(() => inputRef.current?.focus(), 200);
  };

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
        setDisplayCount((c) => c + 1);
        setText("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      {/* Toggle button */}
      <button
        onClick={toggle}
        className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface"
      >
        <MessageCircle className="h-4 w-4" />
        {displayCount > 0 && <span>{displayCount}</span>}
      </button>

      {/* Inline comments */}
      {expanded && (
        <div className="mt-2 space-y-3 rounded-xl bg-surface/50 px-3 py-3">
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="flex gap-2">
                  <div className="h-6 w-6 animate-pulse rounded-full bg-border/40" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-24 animate-pulse rounded bg-border/40" />
                    <div className="h-3 w-full animate-pulse rounded bg-border/40" />
                  </div>
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <p className="py-2 text-center text-[12px] text-muted">
              Sé el primero en comentar
            </p>
          ) : (
            <div className="space-y-2.5">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <Avatar className="h-6 w-6 flex-shrink-0">
                    {c.user.image && <AvatarImage src={c.user.image} />}
                    <AvatarFallback className="text-[9px]">
                      {c.user.name?.charAt(0) ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug">
                      <span className="font-semibold text-foreground">
                        {c.user.name?.split(" ")[0]}{" "}
                      </span>
                      <span className="text-foreground/80">{c.body}</span>
                    </p>
                    <span className="text-[10px] text-muted">
                      {timeAgo(c.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex items-center gap-2 pt-1">
            <input
              ref={inputRef}
              type="text"
              className="flex-1 rounded-full bg-white px-3.5 py-2 text-[14px] text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent/30"
              style={{ fontSize: "16px" }}
              placeholder="Comentar..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <button
              onClick={submit}
              disabled={!text.trim() || submitting}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:opacity-30"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
