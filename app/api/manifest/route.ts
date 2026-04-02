import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getServerBranding } from "@/lib/branding.server";

export async function GET() {
  const b = await getServerBranding();
  const h = await headers();
  const host = h.get("host") || process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  const icons = [
    { src: "/api/icon?size=192", sizes: "192x192", type: "image/png" },
    { src: "/api/icon?size=512", sizes: "512x512", type: "image/png" },
  ];

  const manifest = {
    name: `${b.studioName} Studio`,
    short_name: b.studioName,
    id: `/?homescreen=1`,
    description: `${b.tagline} — ${b.slogan}`,
    start_url: "/my",
    scope: "/",
    display: "standalone",
    background_color: b.colorBg,
    theme_color: b.colorBg,
    orientation: "portrait",
    icons,
    handle_links: "preferred",
    launch_handler: {
      client_mode: ["navigate-existing", "auto"],
    },
    scope_extensions: [{ origin }],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
