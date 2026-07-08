// Inbound-email routing for partner-platform reservations.
//
// Only ClassPass uses email parsing now. The legacy Wellhub/Gympass mailbox is
// no longer routed — Wellhub bookings arrive via the Booking API webhooks.
// We keep the `generateInboundEmail` signature accepting `PlatformType` so
// existing UI helpers continue to compile, but only ClassPass yields a useful
// address.

import type { PlatformType } from "@prisma/client";

const INBOUND_DOMAIN = "in.mgic.app";

export function generateInboundEmail(
  tenantSlug: string,
  platform: PlatformType,
): string {
  // Every platform gets a distinct address. Only ClassPass is actually routed
  // (see parseInboundEmail); for Wellhub/others the address is unused but must
  // still be unique — StudioPlatformConfig.inboundEmail is `@unique`, so the
  // previous shared "" placeholder let only ONE tenant ever create a Wellhub
  // config; the next tenant hit the unique constraint and the create failed
  // silently. This matches the address the Wellhub config route already writes.
  return `${platform}.${tenantSlug}@${INBOUND_DOMAIN}`;
}

export function parseInboundEmail(
  recipient: string,
): { platform: "classpass"; tenantSlug: string } | null {
  const match = recipient.match(/^(classpass)\.([^@]+)@in\.mgic\.app$/i);
  if (!match) return null;
  return {
    platform: "classpass",
    tenantSlug: match[2].toLowerCase(),
  };
}
