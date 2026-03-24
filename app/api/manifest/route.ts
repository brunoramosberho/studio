import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  let studioName = "Flō";
  let tagline = "Pilates & Wellness";
  let slogan = "Muévete. Respira. Floréce.";
  let appIconUrl: string | null = null;
  let colorBg = "#FAF9F6";

  try {
    const settings = await prisma.studioSettings.findUnique({
      where: { id: "singleton" },
    });
    if (settings) {
      studioName = settings.studioName;
      tagline = settings.tagline;
      slogan = settings.slogan;
      appIconUrl = settings.appIconUrl;
      colorBg = settings.colorBg;
    }
  } catch {}

  const icons = appIconUrl
    ? [
        { src: appIconUrl, sizes: "192x192", type: "image/png" },
        { src: appIconUrl, sizes: "512x512", type: "image/png" },
      ]
    : [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
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
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
