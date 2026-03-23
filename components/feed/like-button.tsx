"use client";

import { useState, useCallback } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface LikeButtonProps {
  eventId: string;
  initialLiked: boolean;
  initialCount: number;
  isAchievement?: boolean;
}

export function LikeButton({
  eventId,
  initialLiked,
  initialCount,
  isAchievement = false,
}: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [animating, setAnimating] = useState(false);

  const toggle = useCallback(async () => {
    const newLiked = !liked;
    setLiked(newLiked);
    setCount((c) => c + (newLiked ? 1 : -1));
    if (newLiked) {
      setAnimating(true);
      setTimeout(() => setAnimating(false), 400);
    }

    try {
      await fetch(`/api/feed/${eventId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: isAchievement ? "kudos" : "like" }),
      });
    } catch {
      setLiked(!newLiked);
      setCount((c) => c + (newLiked ? -1 : 1));
    }
  }, [liked, eventId, isAchievement]);

  const label = isAchievement ? "🙌" : null;

  return (
    <button
      onClick={toggle}
      className={cn(
        "flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all active:scale-95",
        liked
          ? isAchievement
            ? "bg-accent/10 text-accent"
            : "bg-rose-50 text-rose-600"
          : "text-muted hover:bg-surface",
      )}
    >
      {isAchievement ? (
        <span
          className={cn(
            "text-base transition-transform",
            animating && "animate-bounce",
          )}
        >
          🙌
        </span>
      ) : (
        <Heart
          className={cn(
            "h-4 w-4 transition-transform",
            liked && "fill-rose-500 text-rose-500",
            animating && "scale-125",
          )}
        />
      )}
      {count > 0 && <span>{count}</span>}
    </button>
  );
}
