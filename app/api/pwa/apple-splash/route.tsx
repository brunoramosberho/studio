import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { getServerBranding } from "@/lib/branding.server";

// Node.js runtime is required because getServerBranding() uses Prisma.
// Edge runtime would silently fail and the route would return an error
// instead of a PNG, which iOS interprets as "no splash" and falls back
// to a flat white/black frame.
export const runtime = "nodejs";

/**
 * Dynamic Apple PWA splash screen generator.
 *
 * iOS requires an `apple-touch-startup-image` for every device size,
 * otherwise the native launch shows a flat black/white screen before the
 * web content mounts. Rather than pre-generating dozens of PNGs per
 * tenant, we render a branded splash on demand at the exact requested
 * dimensions. iOS caches the result, so it's only generated once per
 * device/tenant.
 *
 * Intentionally avoids `<img src={remoteUrl}>` inside `ImageResponse`:
 * Satori fetches the remote image during render, and any network hiccup
 * (slow CDN, CORS, timeout) causes the render to fail silently — which
 * then makes iOS fall back to a flat splash. We instead render the
 * studio initial on an accent-colored tile, which always succeeds.
 *
 * Query params:
 *   - w: pixel width of the splash (matches the device resolution)
 *   - h: pixel height of the splash
 */
export async function GET(request: NextRequest) {
  const rawW = parseInt(request.nextUrl.searchParams.get("w") || "1170", 10);
  const rawH = parseInt(request.nextUrl.searchParams.get("h") || "2532", 10);

  // Clamp to reasonable PWA dimensions to avoid abuse.
  const width = Math.min(Math.max(rawW || 1170, 320), 3000);
  const height = Math.min(Math.max(rawH || 2532, 320), 3000);

  // Resolve branding with a hard-coded safe fallback so the route never
  // throws — iOS *must* get a PNG back to render a branded splash.
  let heroBg = "#18181B";
  let accent = "#FF5A2C";
  let initial = "R";
  try {
    const b = await getServerBranding();
    heroBg = b.colorHeroBg || heroBg;
    accent = b.colorAccent || accent;
    initial = (b.studioName?.charAt(0) || "R").toUpperCase();
  } catch {
    // fall through with defaults
  }

  const minEdge = Math.min(width, height);
  const iconSize = Math.round(minEdge * 0.28);
  const iconRadius = Math.round(iconSize * 0.22);
  const fontSize = Math.round(iconSize * 0.5);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Branded surface + soft accent glow. Using hex + alpha suffix
          // (supported by Satori) for the radial highlight.
          backgroundColor: heroBg,
          backgroundImage: `radial-gradient(ellipse at 50% 42%, ${accent}40 0%, ${heroBg} 70%)`,
        }}
      >
        <div
          style={{
            width: iconSize,
            height: iconSize,
            borderRadius: iconRadius,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: accent,
            color: "#FFFFFF",
            fontFamily: "system-ui, -apple-system, sans-serif",
            fontWeight: 700,
            fontSize,
            boxShadow: "0 24px 80px rgba(0, 0, 0, 0.4)",
          }}
        >
          {initial}
        </div>
      </div>
    ),
    {
      width,
      height,
      headers: {
        "Cache-Control": "public, max-age=604800, s-maxage=31536000, immutable",
      },
    },
  );
}
