import "server-only";
import { getTenant } from "@/lib/tenant";
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
