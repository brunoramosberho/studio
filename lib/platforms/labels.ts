import type { PlatformType } from "@prisma/client";

/**
 * Partner display names. Shared by member-facing copy and the booking badge —
 * `PlatformType` values are lowercase slugs, never show them raw.
 */
const PARTNER_LABEL: Record<PlatformType, string> = {
  wellhub: "Wellhub",
  classpass: "ClassPass",
  totalpass: "TotalPass",
  fitpass: "Fitpass",
};

export function partnerLabel(platform: PlatformType | null | undefined): string | null {
  return platform ? (PARTNER_LABEL[platform] ?? null) : null;
}
