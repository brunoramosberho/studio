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
  if (platform !== "classpass") {
    // Wellhub no longer participates in the email flow; return a sentinel that
    // the UI can detect and hide. We do not throw to avoid breaking pages that
    // still render a generic inbox column.
    return "";
  }
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
