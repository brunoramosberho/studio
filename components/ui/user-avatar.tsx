"use client";

import { useBranding } from "@/components/branding-provider";
import type { LoyaltyTierVisual } from "@/lib/loyalty-tier";
import { cn } from "@/lib/utils";

const LEVEL_BADGES: Record<LoyaltyTierVisual, string | null> = {
  bronze: null,
  silver: "🥈",
  gold: "🥇",
  platinum: "💠",
  elite: "👑",
};

export interface UserAvatarUser {
  id?: string;
  image?: string | null;
  name?: string | null;
  hasActiveMembership?: boolean;
  level?: LoyaltyTierVisual | null;
}

export interface UserAvatarProps {
  user: UserAvatarUser;
  size?: number;
  showBadge?: boolean;
  onClick?: () => void;
  className?: string;
}

export function UserAvatar({
  user,
  size = 40,
  showBadge = true,
  onClick,
  className,
}: UserAvatarProps) {
  const { colorFg } = useBranding();

  const isMember = user.hasActiveMembership === true;
  const borderRadius = isMember ? size * 0.25 : size / 2;

  const initials = (user.name ?? "")
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const levelBadge =
    showBadge && user.level ? LEVEL_BADGES[user.level] : null;

  const badgeSize = Math.max(14, Math.round(size * 0.38));
  const badgeFontSize = Math.max(8, Math.round(size * 0.22));

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <div
        className="overflow-hidden"
        style={{
          width: size,
          height: size,
          borderRadius,
          ...(isMember && { border: `2.5px solid ${colorFg}` }),
          boxSizing: "border-box",
        }}
      >
        {user.image ? (
          <img
            src={user.image}
            alt={user.name ?? ""}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center font-bold text-white"
            style={{
              backgroundColor: colorFg,
              fontSize: Math.round(size * 0.32),
            }}
          >
            {initials}
          </div>
        )}
      </div>
      {levelBadge && (
        <span
          className="absolute flex items-center justify-center rounded-full bg-white shadow-sm ring-[1.5px] ring-white"
          style={{
            bottom: -1,
            right: -1,
            width: badgeSize,
            height: badgeSize,
            fontSize: badgeFontSize,
            lineHeight: 1,
          }}
        >
          {levelBadge}
        </span>
      )}
    </Wrapper>
  );
}
