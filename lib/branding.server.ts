import "server-only";
import { getTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { tenantToBranding, DEFAULTS, type StudioBranding } from "@/lib/branding";

/** Server-side helper to get branding from current tenant */
export async function getServerBranding(): Promise<StudioBranding> {
  try {
    const tenant = await getTenant();
    if (tenant) return tenantToBranding(tenant);
    return DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

/**
 * Server-side helper to get branding by tenant id. Use this when there is no
 * request-scoped tenant header (e.g. cron jobs, background callbacks).
 */
export async function getBrandingForTenantId(
  tenantId: string,
): Promise<StudioBranding> {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (tenant) return tenantToBranding(tenant);
    return DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}
