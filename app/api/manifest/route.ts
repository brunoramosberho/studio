import { NextResponse } from "next/server";
import { getServerBranding } from "@/lib/branding.server";

export async function GET() {
  const b = await getServerBranding();

  const icons = [
    { src: "/api/icon?size=192", sizes: "192x192", type: "image/png" },
    { src: "/api/icon?size=512", sizes: "512x512", type: "image/png" },
  ];

  const manifest = {
    name: `${b.studioName} Studio`,
    short_name: b.studioName,
    description: `${b.tagline} — ${b.slogan}`,
    start_url: "/my",
    scope: "/",
    display: "standalone",
    background_color: b.colorBg,
    theme_color: b.colorBg,
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
