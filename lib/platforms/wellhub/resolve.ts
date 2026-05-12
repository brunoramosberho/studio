// Webhook handlers resolve the owning tenant by Wellhub `gym_id` (no header
// based routing). This module owns that lookup so every handler is consistent.

import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export type ResolvedWellhubTenant = {
  tenantId: string;
  config: Prisma.StudioPlatformConfigGetPayload<Record<string, never>>;
};

export async function resolveTenantByWellhubGymId(
  gymId: number,
): Promise<ResolvedWellhubTenant | null> {
  const config = await prisma.studioPlatformConfig.findUnique({
    where: { wellhubGymId: gymId },
  });
  if (!config) return null;
  return { tenantId: config.tenantId, config };
}

/** Throws if no tenant matches — useful from webhook handlers that should 4xx. */
export async function requireTenantByWellhubGymId(
  gymId: number,
): Promise<ResolvedWellhubTenant> {
  const resolved = await resolveTenantByWellhubGymId(gymId);
  if (!resolved) {
    throw new Error(`No tenant configured for Wellhub gym_id=${gymId}`);
  }
  return resolved;
}
