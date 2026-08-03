// Gyms linked to Mgic on Wellhub (Integration Setup API), enriched with what
// we know locally: the gym's name (from onboarding notifications) and whether
// the id is already mapped — to this tenant, one of its studios, or another
// tenant ("en uso", without revealing whose).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { getWellhubTokenForTenant } from "@/lib/platforms/wellhub/client";
import { listSystemGyms } from "@/lib/platforms/wellhub/integration-setup";

export async function GET() {
  try {
    const ctx = await requireRole("ADMIN");
    const tenantId = ctx.tenant.id;

    const token = await getWellhubTokenForTenant(tenantId).catch(() => null);
    if (!token) {
      return NextResponse.json({ available: false, reason: "no_token", gyms: [] });
    }

    const linked = await listSystemGyms(token);
    const ids = linked.map((g) => g.id);
    if (ids.length === 0) return NextResponse.json({ available: true, gyms: [] });

    const [onboardRequests, configs, studios] = await Promise.all([
      prisma.wellhubOnboardRequest.findMany({
        where: { wellhubGymId: { in: ids } },
        select: { wellhubGymId: true, gymName: true },
      }),
      prisma.studioPlatformConfig.findMany({
        where: { wellhubGymId: { in: ids } },
        select: { wellhubGymId: true, tenantId: true },
      }),
      prisma.studio.findMany({
        where: { wellhubGymId: { in: ids } },
        select: { wellhubGymId: true, tenantId: true, name: true },
      }),
    ]);
    const nameByGym = new Map(onboardRequests.map((r) => [r.wellhubGymId, r.gymName]));
    const configByGym = new Map(configs.map((c) => [c.wellhubGymId!, c.tenantId]));
    const studioByGym = new Map(studios.map((s) => [s.wellhubGymId!, s]));

    const gyms = linked.map((g) => {
      const cfgTenant = configByGym.get(g.id);
      const studio = studioByGym.get(g.id);
      let state: "mine" | "taken" | "available" = "available";
      let mappedTo: string | null = null;
      if (studio) {
        state = studio.tenantId === tenantId ? "mine" : "taken";
        mappedTo = studio.tenantId === tenantId ? studio.name : null;
      } else if (cfgTenant) {
        state = cfgTenant === tenantId ? "mine" : "taken";
        mappedTo = cfgTenant === tenantId ? "principal" : null;
      }
      return {
        id: g.id,
        enabled: g.enabled,
        name: nameByGym.get(g.id) ?? null,
        state,
        mappedTo,
      };
    });

    return NextResponse.json({ available: true, gyms });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("GET /api/platforms/wellhub/linked-gyms error:", error);
    return NextResponse.json({ available: false, reason: "api_error", gyms: [] }, { status: 200 });
  }
}
