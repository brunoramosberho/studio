import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const DEFAULTS = {
  id: "singleton" as const,
  studioName: "Flō",
  tagline: "Pilates & Wellness",
  slogan: "Muévete. Respira. Floréce.",
  metaDescription: "Tu espacio de Pilates y bienestar.",
  logoUrl: null,
  appIconUrl: null,
  fontPairing: "playfair-dmsans",
  colorBg: "#FAF9F6",
  colorFg: "#1C1917",
  colorSurface: "#F5F2ED",
  colorAccent: "#C9A96E",
  colorAccentSoft: "#E8D9BF",
  colorMuted: "#8C8279",
  colorBorder: "#E8E2D9",
  colorCoach: "#2D5016",
  colorAdmin: "#1A2C4E",
  coachIconSvg: null,
};

export async function GET() {
  try {
    const settings = await prisma.studioSettings.findUnique({
      where: { id: "singleton" },
    });
    return NextResponse.json(settings ?? DEFAULTS);
  } catch {
    return NextResponse.json(DEFAULTS);
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();

    const data: Record<string, string | null> = {};
    const allowedFields = [
      "studioName", "tagline", "slogan", "metaDescription", "logoUrl", "appIconUrl",
      "fontPairing", "colorBg", "colorFg", "colorSurface", "colorAccent",
      "colorAccentSoft", "colorMuted", "colorBorder", "colorCoach", "colorAdmin",
      "coachIconSvg",
    ];

    for (const field of allowedFields) {
      if (field in body) {
        data[field] = body[field];
      }
    }

    const settings = await prisma.studioSettings.upsert({
      where: { id: "singleton" },
      update: data,
      create: { id: "singleton", ...data },
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
