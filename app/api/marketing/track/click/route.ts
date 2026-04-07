import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTenant } from "@/lib/tenant";

export async function POST(req: NextRequest) {
  try {
    const tenant = await getTenant();
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 400 });
    }

    const body = await req.json();
    const { entityType, entityId, utmSource, utmMedium, utmCampaign, utmContent, utmTerm, referrer } = body;

    if (!entityType || !entityId) {
      return NextResponse.json({ error: "Missing entityType or entityId" }, { status: 400 });
    }

    const userAgent = req.headers.get("user-agent") || undefined;

    // Fire-and-forget write for < 50ms response
    prisma.linkClick
      .create({
        data: {
          tenantId: tenant.id,
          entityType,
          entityId,
          utmSource: utmSource || null,
          utmMedium: utmMedium || null,
          utmCampaign: utmCampaign || null,
          utmContent: utmContent || null,
          utmTerm: utmTerm || null,
          referrer: referrer || null,
          userAgent,
        },
      })
      .then((click) => {
        // Set cookie via response is not possible here since we already respond,
        // but the click ID is stored for attribution
        void click;
      })
      .catch((err) => console.error("LinkClick insert error:", err));

    const response = NextResponse.json({ ok: true });

    // We create the click optimistically and set a cookie with a placeholder
    // The actual click ID attribution happens server-side in the conversion endpoint
    response.cookies.set("_mgic_click", `${tenant.id}:${entityType}:${entityId}`, {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("POST /api/marketing/track/click error:", error);
    return NextResponse.json({ ok: true }); // Don't fail publicly
  }
}
