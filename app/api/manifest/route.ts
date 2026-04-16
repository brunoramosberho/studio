import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getServerBranding } from "@/lib/branding.server";

const PORTAL_CONFIG = {
  my: {
    suffix: "",
    start_url: "/my",
  },
  admin: {
    suffix: " Admin",
    start_url: "/admin",
  },
  coach: {
    suffix: " Coach",
    start_url: "/coach",
  },
} as const;

type Portal = keyof typeof PORTAL_CONFIG;

export async function GET(request: NextRequest) {
  const portal = (request.nextUrl.searchParams.get("portal") || "my") as Portal;
  const cfg = PORTAL_CONFIG[portal] ?? PORTAL_CONFIG.my;

  const b = await getServerBranding();
  const h = await headers();
  const host = h.get("host") || process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  const themeColor =
    portal === "admin" ? b.colorAdmin :
    portal === "coach" ? b.colorCoach :
    b.colorBg;

  // Client PWA uses the tenant's branded hero surface as the native
  // splash background. On iOS 17+, if apple-touch-startup-image can't be
  // used, the OS generates a splash from the manifest (icon + this bg).
  // On Android, this is the native launch bg directly. Admin/coach
  // PWAs keep the original neutral background.
  const backgroundColor = portal === "my" ? b.colorHeroBg : b.colorBg;

  const icons = [
    { src: "/api/icon?size=192", sizes: "192x192", type: "image/png" },
    { src: "/api/icon?size=512", sizes: "512x512", type: "image/png" },
  ];

  const manifest = {
    name: `${b.studioName}${cfg.suffix}`,
    short_name: `${b.studioName}${cfg.suffix}`,
    id: cfg.start_url,
    description: `${b.tagline} — ${b.slogan}`,
    start_url: cfg.start_url,
    scope: "/",
    display: "standalone",
    background_color: backgroundColor,
    theme_color: themeColor,
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
