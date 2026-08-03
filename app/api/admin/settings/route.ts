import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTenant, requireRole } from "@/lib/tenant";
import { tenantToBranding, DEFAULTS } from "@/lib/branding";

export async function GET() {
  try {
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json(DEFAULTS);
    return NextResponse.json(tenantToBranding(tenant));
  } catch {
    return NextResponse.json(DEFAULTS);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");

    const body = await request.json();

    const allowedFields = [
      "name", "tagline", "slogan", "metaDescription", "logoUrl", "appIconUrl",
      "fontPairing", "colorBg", "colorFg", "colorSurface", "colorAccent",
      "colorAccentSoft", "colorMuted", "colorBorder", "colorHeroBg", "colorCoach", "colorAdmin",
      "coachIconSvg", "landingUrl", "communityHeadline", "locale",
    ];

    // Landing copy is a map, not a string, so it can't ride the allow-list
    // above. Only known keys are stored and blanks are dropped, so clearing a
    // field means "use the default wording" rather than "show nothing".
    let landingCopy: Record<string, string> | undefined;
    if (body.landingCopy && typeof body.landingCopy === "object") {
      const { LANDING_COPY_KEYS } = await import("@/lib/landing-copy");
      landingCopy = {};
      for (const key of LANDING_COPY_KEYS) {
        const value = (body.landingCopy as Record<string, unknown>)[key];
        if (typeof value === "string" && value.trim()) {
          landingCopy[key] = value.trim().slice(0, 300);
        }
      }
    }

    const data: Record<string, string | null> = {};
    for (const field of allowedFields) {
      // Map studioName → name for backward compat with the admin UI
      const sourceField = field === "name" ? "studioName" : field;
      if (sourceField in body) {
        data[field] = body[sourceField];
      } else if (field in body) {
        data[field] = body[field];
      }
    }

    const tenant = await prisma.tenant.update({
      where: { id: ctx.tenant.id },
      data: { ...data, ...(landingCopy ? { landingCopy } : {}) },
    });

    return NextResponse.json(tenantToBranding(tenant));
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
