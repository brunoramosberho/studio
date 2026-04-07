import type { PlatformType } from "@prisma/client";

const INBOUND_DOMAIN = "in.mgic.app";

export function generateInboundEmail(
  tenantSlug: string,
  platform: PlatformType,
): string {
  return `${platform}.${tenantSlug}@${INBOUND_DOMAIN}`;
}

export function parseInboundEmail(
  recipient: string,
): { platform: PlatformType; tenantSlug: string } | null {
  const match = recipient.match(
    /^(classpass|gympass)\.([^@]+)@in\.mgic\.app$/i,
  );
  if (!match) return null;
  return {
    platform: match[1].toLowerCase() as PlatformType,
    tenantSlug: match[2].toLowerCase(),
  };
}
