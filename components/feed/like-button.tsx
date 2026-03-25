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

  return (
    <button
      onClick={toggle}
      className={cn(
        "flex items-center gap-1 py-1.5 pr-2 text-[13px] transition-all active:scale-95",
        liked
          ? isAchievement
            ? "text-accent"
            : "text-rose-500"
          : "text-muted",
      )}
    >
      {isAchievement ? (
        <span
          className={cn(
            "text-[15px] leading-none transition-transform",
            animating && "scale-125",
          )}
        >
          🙌
        </span>
      ) : (
        <Heart
          className={cn(
            "h-[18px] w-[18px] transition-transform",
            liked && "fill-rose-500 text-rose-500",
            animating && "scale-125",
          )}
        />
      )}
      {count > 0 && <span className="text-[12px]">{count}</span>}
    </button>
  );
}
