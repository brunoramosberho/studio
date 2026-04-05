"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { UserAvatar, type UserAvatarUser } from "@/components/ui/user-avatar";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { useSession } from "next-auth/react";

interface CommentData {
  id: string;
  body: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    hasActiveMembership?: boolean;
    level?: string | null;
  };
}

interface CommentsSheetProps {
  eventId: string;
  commentCount: number;
}

const QUICK_EMOJIS = ["❤️", "🙌", "🔥", "👏", "😢", "😍", "😮", "😂"];

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
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [displayCount, setDisplayCount] = useState(commentCount);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const { data: session } = useSession();

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

  const handleOpen = () => {
    setOpen(true);
    fetchComments();
  };

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setTimeout(() => inputRef.current?.focus(), 300);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!loading && comments.length > 0 && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments.length, loading]);

  const submit = async (body?: string) => {
    const value = (body ?? text).trim();
    if (!value || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/feed/${eventId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: value }),
      });
      if (res.ok) {
        const comment = await res.json();
        setComments((prev) => [...prev, comment]);
        setDisplayCount((c) => c + 1);
        setText("");
        setTimeout(() => {
          listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
        }, 50);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const currentUser = session?.user;

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1 py-1.5 pr-2 text-[13px] text-muted transition-colors"
      >
        <MessageCircle className="h-[18px] w-[18px]" />
        {displayCount > 0 && (
          <span className="text-[12px]">{displayCount}</span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 -bottom-[50vh] z-[60] bg-white sm:bottom-0 sm:bg-foreground/40 sm:backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />

            <div className="fixed inset-0 z-[60] flex items-end justify-center pointer-events-none sm:items-center sm:p-6">
            <motion.div
              drag="y"
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.8 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 80 || info.velocity.y > 300) {
                  setOpen(false);
                }
              }}
              className="pointer-events-auto flex w-full max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-[var(--shadow-warm-lg)] sm:max-w-md sm:rounded-2xl sm:max-h-[min(620px,85dvh)] sm:shadow-xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 400 }}
            >
              {/* Drag handle + header */}
              <div
                className="touch-none cursor-grab active:cursor-grabbing sm:cursor-default"
                onPointerDown={(e) => dragControls.start(e)}
              >
                <div className="flex justify-center pt-3 pb-1 sm:hidden">
                  <div className="h-1 w-10 rounded-full bg-border/60" />
                </div>

                <div className="flex items-center justify-between px-5 pb-3 pt-1 sm:pt-4">
                  <div className="w-8" />
                  <h2 className="font-display text-[15px] font-bold text-foreground">
                    Comentarios
                  </h2>
                  <button
                    onClick={() => setOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface active:bg-surface"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="h-px bg-border/30" />

              {/* Comments list */}
              <div
                ref={listRef}
                className="flex-1 overflow-y-auto overscroll-contain px-4 py-3"
                style={{ minHeight: "200px" }}
              >
                {loading ? (
                  <div className="space-y-4 py-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex gap-3">
                        <div className="h-8 w-8 animate-pulse rounded-full bg-border/40" />
                        <div className="flex-1 space-y-1.5 pt-0.5">
                          <div className="h-3 w-24 animate-pulse rounded bg-border/40" />
                          <div className="h-3 w-full animate-pulse rounded bg-border/40" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : comments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <p className="text-[15px] font-semibold text-foreground">
                      Sin comentarios aún
                    </p>
                    <p className="mt-1 text-[13px] text-muted">
                      Sé el primero en comentar
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {comments.map((c) => (
                      <div key={c.id} className="flex gap-3">
                        <UserAvatar
                          user={c.user as UserAvatarUser}
                          size={32}
                          showBadge={false}
                          className="flex-shrink-0 mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] leading-snug">
                            <span className="font-semibold text-foreground">
                              {c.user.name?.split(" ")[0]}{" "}
                            </span>
                            <span className="text-foreground/80">{c.body}</span>
                          </p>
                          <div className="mt-1 flex items-center gap-3">
                            <span className="text-[11px] text-muted">
                              {timeAgo(c.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Emoji quick-reactions */}
              <div className="border-t border-border/30 px-4 pt-2.5 pb-1">
                <div className="flex items-center justify-between">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => {
                        setText((prev) => prev + emoji);
                        inputRef.current?.focus();
                      }}
                      disabled={submitting}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-[22px] transition-transform active:scale-125 disabled:opacity-40"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input composer */}
              <div className="flex items-center gap-3 border-t border-border/30 px-4 pb-[max(env(safe-area-inset-bottom),20px)] pt-3">
                {currentUser?.image ? (
                  <img
                    src={currentUser.image}
                    alt=""
                    className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface text-[12px] font-bold text-muted">
                    {currentUser?.name?.charAt(0) ?? "?"}
                  </div>
                )}
                <input
                  ref={inputRef}
                  type="text"
                  className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted/50 focus:outline-none"
                  style={{ fontSize: "16px" }}
                  placeholder="Añade un comentario..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
                <button
                  onClick={() => submit()}
                  disabled={!text.trim() || submitting}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:opacity-30"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
