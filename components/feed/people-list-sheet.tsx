"use client";

import { useEffect, useCallback, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { X, UserPlus, Check, Loader2 } from "lucide-react";
import { UserAvatar, type UserAvatarUser } from "@/components/ui/user-avatar";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { maskLastName } from "@/lib/utils";

export interface PersonItem {
  id: string;
  name: string | null;
  image: string | null;
  subtitle?: string;
  hasActiveMembership?: boolean;
  level?: string | null;
}

interface PeopleListSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  people: PersonItem[];
}

type FriendState = "friend" | "pending" | "idle" | "sending" | "sent" | "self";

export function PeopleListSheet({ open, onClose, title, people: rawPeople }: PeopleListSheetProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const dragControls = useDragControls();
  const currentUserId = session?.user?.id;

  const people = useMemo(() => {
    const seen = new Set<string>();
    return rawPeople.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [rawPeople]);

  const [friendMap, setFriendMap] = useState<Record<string, FriendState>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded || !currentUserId) return;

    fetch("/api/friends")
      .then((r) => r.json())
      .then((data) => {
        const map: Record<string, FriendState> = {};
        const friends: { id: string }[] = data.friends ?? [];
        const pending: { id: string }[] = (data.pendingRequests ?? []);

        for (const f of friends) map[f.id] = "friend";
        for (const p of pending) map[p.id] = "pending";

        setFriendMap(map);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [open, loaded, currentUserId]);

  useEffect(() => {
    if (!open) setLoaded(false);
  }, [open]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const handlePersonTap = useCallback((personId: string) => {
    onClose();
    setTimeout(() => router.push(`/my/user/${personId}`), 150);
  }, [router, onClose]);

  const handleAddFriend = useCallback(async (userId: string) => {
    setFriendMap((prev) => ({ ...prev, [userId]: "sending" }));
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: userId }),
      });
      if (res.ok || res.status === 409) {
        setFriendMap((prev) => ({ ...prev, [userId]: "sent" }));
      } else {
        setFriendMap((prev) => ({ ...prev, [userId]: "idle" }));
      }
    } catch {
      setFriendMap((prev) => ({ ...prev, [userId]: "idle" }));
    }
  }, []);

  function getState(personId: string): FriendState {
    if (personId === currentUserId) return "self";
    return friendMap[personId] ?? "idle";
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.8 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 150 || info.velocity.y > 500) {
                onClose();
              }
            }}
            className="fixed inset-x-0 bottom-0 z-[60] max-h-[80dvh] overflow-hidden rounded-t-3xl bg-white shadow-[var(--shadow-warm-lg)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 350 }}
          >
            <div
              className="flex justify-center pt-3 pb-1 touch-none cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="h-1 w-10 rounded-full bg-border/60" />
            </div>

            <div className="flex items-center justify-between px-5 pb-3 pt-1">
              <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-muted">{people.length}</span>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted active:bg-surface"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto overscroll-contain px-5 pb-24" style={{ maxHeight: "calc(80dvh - 80px)" }}>
              <div className="space-y-0.5">
                {people.map((person) => {
                  const state = getState(person.id);
                  return (
                    <div
                      key={person.id}
                      className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors"
                    >
                      <button
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        onClick={() => handlePersonTap(person.id)}
                      >
                        <UserAvatar
                          user={person as UserAvatarUser}
                          size={44}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-medium text-foreground">
                            {maskLastName(person.name)}
                          </p>
                          {person.subtitle && (
                            <p className="truncate text-[12px] text-muted">
                              {person.subtitle}
                            </p>
                          )}
                        </div>
                      </button>

                      {state === "idle" && (
                        <button
                          onClick={() => handleAddFriend(person.id)}
                          className="shrink-0 rounded-full border border-accent px-3 py-1.5 text-[12px] font-semibold text-accent transition-colors active:bg-accent/10"
                        >
                          Agregar
                        </button>
                      )}
                      {state === "sending" && (
                        <div className="shrink-0 px-3 py-1.5">
                          <Loader2 className="h-4 w-4 animate-spin text-muted" />
                        </div>
                      )}
                      {state === "sent" && (
                        <span className="shrink-0 flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1.5 text-[12px] font-medium text-accent">
                          <Check className="h-3 w-3" />
                          Enviada
                        </span>
                      )}
                      {state === "pending" && (
                        <span className="shrink-0 rounded-full bg-surface px-3 py-1.5 text-[12px] font-medium text-muted">
                          Pendiente
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
