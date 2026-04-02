"use client";

import { useId } from "react";
import { useBranding } from "@/components/branding-provider";
import type { LoyaltyTierVisual } from "@/lib/loyalty-tier";
import { cn } from "@/lib/utils";

const TIER_GRADIENT: Record<
  LoyaltyTierVisual,
  { stops: [string, string, string]; icon: string }
> = {
  bronze: {
    stops: ["#daa06d", "#b87333", "#6b3a1e"],
    icon: "rgba(80,40,15,0.45)",
  },
  silver: {
    stops: ["#d1d5db", "#9ca3af", "#6b7280"],
    icon: "rgba(75,85,99,0.4)",
  },
  gold: {
    stops: ["#fde68a", "#d97706", "#78350f"],
    icon: "rgba(120,53,15,0.5)",
  },
  platinum: {
    stops: ["#dde8f5", "#8fa0bc", "#4a5a70"],
    icon: "rgba(59,77,110,0.4)",
  },
  elite: {
    stops: ["#b8b8d4", "#7c7c9a", "#3a3a52"],
    icon: "rgba(46,46,66,0.45)",
  },
};

const BADGE_TIERS = new Set<LoyaltyTierVisual>([
  "silver",
  "gold",
  "platinum",
  "elite",
]);

const SHIELD_RATIO = 52 / 44;
const SHIELD_OUTER =
  "M4,0 H40 Q44,0 44,4 V28 Q44,44 22,52 Q0,44 0,28 V4 Q0,0 4,0 Z";
const SHIELD_INNER =
  "M6.5,2.5 H37.5 Q41.5,2.5 41.5,6.5 V28 Q41.5,42 22,49.5 Q2.5,42 2.5,28 V6.5 Q2.5,2.5 6.5,2.5 Z";

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

function TierCircleBadge({
  tier,
  size,
  coachIconSvg,
}: {
  tier: LoyaltyTierVisual;
  size: number;
  coachIconSvg: string | null;
}) {
  const uid = useId().replace(/:/g, "_");
  const g = TIER_GRADIENT[tier];
  const gradId = `${uid}cg`;
  const sheenId = `${uid}cs`;

  return (
    <span
      className="absolute overflow-hidden rounded-full shadow-sm ring-[1.5px] ring-white"
      style={{ bottom: -1, right: -1, width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0%" stopColor={g.stops[0]} />
            <stop offset="50%" stopColor={g.stops[1]} />
            <stop offset="100%" stopColor={g.stops[2]} />
          </linearGradient>
          <linearGradient id={sheenId} x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.32" />
            <stop offset="45%" stopColor="white" stopOpacity="0" />
            <stop offset="100%" stopColor="black" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="50" fill={`url(#${gradId})`} />
        <circle cx="50" cy="50" r="50" fill={`url(#${sheenId})`} />
      </svg>
      {coachIconSvg && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ padding: "22%" }}
        >
          <div
            className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
            style={{ color: g.icon }}
            dangerouslySetInnerHTML={{ __html: coachIconSvg }}
          />
        </div>
      )}
    </span>
  );
}

export function UserAvatar({
  user,
  size = 40,
  showBadge = true,
  onClick,
  className,
}: UserAvatarProps) {
  const { colorFg, colorAccent, coachIconSvg } = useBranding();
  const clipId = useId();

  const isMember = user.hasActiveMembership === true;

  const initials = (user.name ?? "")
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const showLevelBadge =
    showBadge && user.level && BADGE_TIERS.has(user.level);
  const badgeSize = Math.max(14, Math.round(size * 0.38));

  const Wrapper = onClick ? "button" : "div";

  if (isMember) {
    const shieldH = size;
    const shieldW = Math.round(size / SHIELD_RATIO);
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
          <path d={SHIELD_OUTER} fill={borderColor} />
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
                <rect
                  x="2.5"
                  y="2.5"
                  width="39"
                  height="47"
                  fill={colorFg}
                />
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

        {showLevelBadge && (
          <TierCircleBadge
            tier={user.level!}
            size={badgeSize}
            coachIconSvg={coachIconSvg}
          />
        )}
      </Wrapper>
    );
  }

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
      {showLevelBadge && (
        <TierCircleBadge
          tier={user.level!}
          size={badgeSize}
          coachIconSvg={coachIconSvg}
        />
      )}
    </Wrapper>
  );
}
