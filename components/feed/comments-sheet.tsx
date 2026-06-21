"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { MessageCircle, Send, X, Heart } from "lucide-react";
import { UserAvatar, type UserAvatarUser } from "@/components/ui/user-avatar";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useBranding } from "@/components/branding-provider";
import { cn } from "@/lib/utils";

interface CommentUser {
  id: string;
  name: string | null;
  image: string | null;
  hasActiveMembership?: boolean;
  level?: string | null;
  isStudio?: boolean;
}

interface CommentData {
  id: string;
  body: string;
  createdAt: string;
  parentId: string | null;
  asStudio: boolean;
  likeCount: number;
  likedByMe: boolean;
  user: CommentUser;
  replies?: CommentData[];
}

interface CommentsSheetProps {
  eventId: string;
  commentCount: number;
  /** Comment + post as the studio (admin feed). */
  asStudio?: boolean;
}

const QUICK_EMOJIS = ["❤️", "🙌", "🔥", "👏", "😢", "😍", "😮", "😂"];

function countAll(list: CommentData[]) {
  return list.reduce((sum, c) => sum + 1 + (c.replies?.length ?? 0), 0);
}

export function CommentsSheet({ eventId, commentCount, asStudio = false }: CommentsSheetProps) {
  const t = useTranslations("feed");
  const router = useRouter();
  const { studioName, logoUrl, appIconUrl } = useBranding() as {
    studioName: string;
    logoUrl?: string | null;
    appIconUrl?: string | null;
  };

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("timeNow");
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [displayCount, setDisplayCount] = useState(commentCount);
  const [replyTo, setReplyTo] = useState<{ rootId: string; name: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const { data: session } = useSession();

  const goToProfile = useCallback(
    (user: CommentUser) => {
      if (user.isStudio || user.id.startsWith("studio:")) return;
      setOpen(false);
      setTimeout(() => router.push(`/my/user/${user.id}`), 150);
    },
    [router],
  );

  const fetchComments = useCallback(async () => {
    if (fetched) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/feed/${eventId}/comments`);
      if (res.ok) {
        const data: CommentData[] = await res.json();
        setComments(data);
        setDisplayCount(countAll(data));
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
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Immutably update a comment (root or reply) in the tree.
  const patchComment = useCallback(
    (id: string, patch: (c: CommentData) => CommentData) => {
      setComments((prev) =>
        prev.map((root) => {
          if (root.id === id) return patch(root);
          if (root.replies?.some((r) => r.id === id)) {
            return {
              ...root,
              replies: root.replies.map((r) => (r.id === id ? patch(r) : r)),
            };
          }
          return root;
        }),
      );
    },
    [],
  );

  const toggleLike = useCallback(
    async (c: CommentData) => {
      const next = !c.likedByMe;
      patchComment(c.id, (x) => ({
        ...x,
        likedByMe: next,
        likeCount: Math.max(0, x.likeCount + (next ? 1 : -1)),
      }));
      try {
        const res = await fetch(
          `/api/feed/${eventId}/comments/${c.id}/like`,
          { method: "POST" },
        );
        if (!res.ok) throw new Error();
      } catch {
        patchComment(c.id, (x) => ({
          ...x,
          likedByMe: !next,
          likeCount: Math.max(0, x.likeCount + (next ? -1 : 1)),
        }));
      }
    },
    [eventId, patchComment],
  );

  const submit = async (raw?: string) => {
    const value = (raw ?? text).trim();
    if (!value || submitting) return;
    setSubmitting(true);
    const replyRootId = replyTo?.rootId;
    try {
      const res = await fetch(`/api/feed/${eventId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: value,
          ...(replyRootId ? { parentId: replyRootId } : {}),
          ...(asStudio ? { asStudio: true } : {}),
        }),
      });
      if (res.ok) {
        const comment: CommentData = await res.json();
        if (replyRootId) {
          patchComment(replyRootId, (root) => ({
            ...root,
            replies: [...(root.replies ?? []), comment],
          }));
        } else {
          setComments((prev) => [...prev, comment]);
        }
        setDisplayCount((n) => n + 1);
        setText("");
        setReplyTo(null);
        if (!replyRootId) {
          setTimeout(() => {
            listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
          }, 50);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const startReply = (rootId: string, name: string | null) => {
    setReplyTo({ rootId, name: name?.split(" ")[0] ?? "" });
    inputRef.current?.focus();
  };

  const currentUser = session?.user;
  const composerImage = asStudio ? (appIconUrl ?? logoUrl ?? null) : currentUser?.image;
  const composerInitial = asStudio
    ? studioName?.charAt(0) ?? "S"
    : currentUser?.name?.charAt(0) ?? "?";

  const renderRow = (c: CommentData, isReply?: boolean) => {
    return (
      <div key={c.id} className="flex gap-3">
        <button
          type="button"
          onClick={() => goToProfile(c.user)}
          className="mt-0.5 flex-shrink-0"
          aria-label={c.user.name ?? undefined}
        >
          <UserAvatar
            user={c.user as UserAvatarUser}
            size={isReply ? 26 : 32}
            showBadge={false}
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug">
            <button
              type="button"
              onClick={() => goToProfile(c.user)}
              className="font-semibold text-foreground hover:underline"
            >
              {c.user.isStudio ? c.user.name : c.user.name?.split(" ")[0]}
            </button>{" "}
            <span className="text-foreground/80">{c.body}</span>
          </p>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-[11px] text-muted">{timeAgo(c.createdAt)}</span>
            {c.likeCount > 0 && (
              <span className="text-[11px] font-medium text-muted">
                {t("likesCount", { count: c.likeCount })}
              </span>
            )}
            <button
              type="button"
              onClick={() => startReply(isReply ? (c.parentId ?? c.id) : c.id, c.user.name)}
              className="text-[11px] font-semibold text-muted hover:text-foreground"
            >
              {t("reply")}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => toggleLike(c)}
          className="mt-0.5 flex flex-shrink-0 flex-col items-center gap-0.5 text-muted"
          aria-label={t("like")}
        >
          <Heart
            className={cn(
              "h-[15px] w-[15px] transition-colors",
              c.likedByMe && "fill-red-500 text-red-500",
            )}
          />
        </button>
      </div>
    );
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1 py-1.5 pr-2 text-[13px] text-muted transition-colors"
      >
        <MessageCircle className="h-[18px] w-[18px]" />
        {displayCount > 0 && <span className="text-[12px]">{displayCount}</span>}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-sm"
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
                  if (info.offset.y > 80 || info.velocity.y > 300) setOpen(false);
                }}
                className="pointer-events-auto w-full sm:max-w-md"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 400 }}
              >
                <div className="flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl bg-card shadow-[var(--shadow-warm-lg)] sm:rounded-2xl sm:max-h-[min(620px,85dvh)] sm:shadow-xl">
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
                        {t("comments")}
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
                          {t("noCommentsYet")}
                        </p>
                        <p className="mt-1 text-[13px] text-muted">
                          {t("beFirstToComment")}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {comments.map((c) => (
                          <div key={c.id} className="space-y-3">
                            {renderRow(c)}
                            {c.replies && c.replies.length > 0 && (
                              <div className="ml-10 space-y-3 border-l border-border/40 pl-3">
                                {c.replies.map((r) => renderRow(r, true))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Reply target chip */}
                  {replyTo && (
                    <div className="flex items-center justify-between border-t border-border/30 bg-surface/40 px-4 py-1.5">
                      <span className="text-[12px] text-muted">
                        {t("replyingTo", { name: replyTo.name })}
                      </span>
                      <button
                        onClick={() => setReplyTo(null)}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-surface"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Emoji quick-reactions */}
                  <div className="border-t border-border/30 px-4 pt-2.5 pb-1">
                    <div className="flex items-center justify-between">
                      {QUICK_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => setText((prev) => prev + emoji)}
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
                    {composerImage ? (
                      <img
                        src={composerImage}
                        alt=""
                        className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface text-[12px] font-bold text-muted">
                        {composerInitial}
                      </div>
                    )}
                    <input
                      ref={inputRef}
                      type="text"
                      className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted/50 focus:outline-none"
                      style={{ fontSize: "16px" }}
                      placeholder={asStudio ? t("commentAsStudio", { name: studioName }) : t("addComment")}
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
                </div>
                {/* Extends background below sheet to cover iOS keyboard gap */}
                <div className="h-[50vh] -mb-[50vh] bg-card sm:hidden" />
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
