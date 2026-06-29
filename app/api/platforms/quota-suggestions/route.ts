// Wellhub quota suggestions for the dashboard "To Review" section. Surfaces
// classes where raising (or lowering) the Wellhub quota would help, with the
// detail needed to render a "Modificar Quota" CTA that opens the editor
// pre-filled with the suggested value.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { getQuotaSuggestions } from "@/lib/platforms/quota-suggestions";

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN", "FRONT_DESK");

    // Only meaningful when Wellhub is active in api mode.
    const config = await prisma.studioPlatformConfig.findFirst({
      where: { tenantId: tenant.id, platform: "wellhub", wellhubMode: "api" },
      select: { id: true },
    });
    if (!config) {
      return NextResponse.json({ enabled: false, suggestions: [] });
    }

    const suggestions = await getQuotaSuggestions(tenant.id);
    return NextResponse.json({ enabled: true, suggestions });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("GET /api/platforms/quota-suggestions error:", error);
    return NextResponse.json({ enabled: false, suggestions: [] }, { status: 500 });
  }
}
