import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  let studioName = "Flō";
  let tagline = "Pilates & Wellness";
  let slogan = "Muévete. Respira. Floréce.";
  let colorBg = "#FAF9F6";

  try {
    const settings = await prisma.studioSettings.findUnique({
      where: { id: "singleton" },
    });
    if (settings) {
      studioName = settings.studioName;
      tagline = settings.tagline;
      slogan = settings.slogan;
      colorBg = settings.colorBg;
    }
  } catch {}

  const icons = [
    { src: "/api/icon?size=192", sizes: "192x192", type: "image/png" },
    { src: "/api/icon?size=512", sizes: "512x512", type: "image/png" },
  ];

  const manifest = {
    name: `${studioName} Studio`,
    short_name: studioName,
    description: `${tagline} — ${slogan}`,
    start_url: "/my",
    scope: "/",
    display: "standalone",
    background_color: colorBg,
    theme_color: colorBg,
    orientation: "portrait",
    icons,
    gcm_sender_id: "",
    permissions: ["notifications"],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
