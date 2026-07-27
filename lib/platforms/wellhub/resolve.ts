// Webhook handlers resolve the owning tenant by Wellhub `gym_id` (no header
// based routing). This module owns that lookup so every handler is consistent.

import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export type ResolvedWellhubTenant = {
  tenantId: string;
  config: Prisma.StudioPlatformConfigGetPayload<Record<string, never>>;
  /**
   * Set when the gym id maps to a specific Studio (multi-location tenants:
   * each unit is its own Wellhub gym). Handlers use it to scope class matching
   * to that location. Null for tenant-level gym ids (single-location, Betoro).
   */
  studioId: string | null;
};

export async function resolveTenantByWellhubGymId(
  gymId: number,
): Promise<ResolvedWellhubTenant | null> {
  // Studio-first: a per-studio gym id is more specific than the tenant-level
  // one, and tells us WHICH location the event belongs to.
  const studio = await prisma.studio.findUnique({
    where: { wellhubGymId: gymId },
    select: { id: true, tenantId: true },
  });
  if (studio) {
    const config = await prisma.studioPlatformConfig.findFirst({
      where: { tenantId: studio.tenantId, platform: "wellhub" },
    });
    if (!config) return null; // studio mapped but platform config missing
    return { tenantId: studio.tenantId, config, studioId: studio.id };
  }

  const config = await prisma.studioPlatformConfig.findUnique({
    where: { wellhubGymId: gymId },
  });
  if (!config) return null;
  return { tenantId: config.tenantId, config, studioId: null };
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
