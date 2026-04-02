"use client";

import { useId } from "react";
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

const SHIELD_RATIO = 52 / 44;
const SHIELD_OUTER = "M4,0 H40 Q44,0 44,4 V28 Q44,44 22,52 Q0,44 0,28 V4 Q0,0 4,0 Z";
const SHIELD_INNER = "M6.5,2.5 H37.5 Q41.5,2.5 41.5,6.5 V28 Q41.5,42 22,49.5 Q2.5,42 2.5,28 V6.5 Q2.5,2.5 6.5,2.5 Z";

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
  const { colorFg, colorAccent } = useBranding();
  const clipId = useId();

  const isMember = user.hasActiveMembership === true;

  const initials = (user.name ?? "")
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const levelBadge =
    showBadge && user.level ? LEVEL_BADGES[user.level] : null;

  const Wrapper = onClick ? "button" : "div";

  if (isMember) {
    const shieldH = size;
    const shieldW = Math.round(size / SHIELD_RATIO);
    const badgeSize = Math.max(14, Math.round(size * 0.38));
    const badgeFontSize = Math.max(8, Math.round(size * 0.22));
    const borderColor = colorAccent || colorFg;

    return (
      <Wrapper
        onClick={onClick}
        className={cn("relative inline-flex shrink-0", className)}
        style={{ width: shieldW, height: shieldH }}
      >
        <svg
          viewBox="0 0 44 52"
          width={shieldW}
          height={shieldH}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <clipPath id={clipId}>
              <path d={SHIELD_INNER} />
            </clipPath>
          </defs>

          {/* Border */}
          <path d={SHIELD_OUTER} fill={borderColor} />

          {/* Image or initials clipped to inner shield */}
          <g clipPath={`url(#${clipId})`}>
            {user.image ? (
              <image
                href={user.image}
                x="2.5"
                y="2.5"
                width="39"
                height="47"
                preserveAspectRatio="xMidYMid slice"
              />
            ) : (
              <>
                <rect x="2.5" y="2.5" width="39" height="47" fill={colorFg} />
                <text
                  x="22"
                  y="28"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontWeight="700"
                  fontSize={size * 0.36}
                >
                  {initials}
                </text>
              </>
            )}
          </g>
        </svg>

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

  // Non-member — circular avatar
  const badgeSize = Math.max(14, Math.round(size * 0.38));
  const badgeFontSize = Math.max(8, Math.round(size * 0.22));

  return (
    <Wrapper
      onClick={onClick}
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <div
        className="overflow-hidden rounded-full"
        style={{ width: size, height: size }}
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
