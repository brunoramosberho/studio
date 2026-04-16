import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { getServerBranding } from "@/lib/branding.server";

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
 * Query params:
 *   - w: pixel width of the splash (matches the device resolution)
 *   - h: pixel height of the splash
 */
export async function GET(request: NextRequest) {
  const w = parseInt(request.nextUrl.searchParams.get("w") || "1170", 10);
  const h = parseInt(request.nextUrl.searchParams.get("h") || "2532", 10);

  // Clamp to reasonable PWA dimensions to avoid abuse.
  const width = Math.min(Math.max(w, 320), 3000);
  const height = Math.min(Math.max(h, 320), 3000);

  try {
    const b = await getServerBranding();
    const minEdge = Math.min(width, height);
    const iconSize = Math.round(minEdge * 0.26);
    const iconRadius = Math.round(iconSize * 0.22);

    const iconContent = b.appIconUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={b.appIconUrl}
        width={iconSize}
        height={iconSize}
        alt=""
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: iconRadius,
          objectFit: "contain",
        }}
      />
    ) : (
      <div
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: iconRadius,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: b.colorAccent,
          color: "#FFFFFF",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontWeight: 700,
          fontSize: Math.round(iconSize * 0.5),
        }}
      >
        {b.studioName.charAt(0).toUpperCase()}
      </div>
    );

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            // Branded surface + soft accent glow so the native splash
            // matches the in-app gradient — no flat black/white frame.
            background: b.colorHeroBg,
            backgroundImage: `radial-gradient(ellipse at 50% 42%, ${b.colorAccent}40 0%, transparent 65%)`,
          }}
        >
          {iconContent}
        </div>
      ),
      {
        width,
        height,
        headers: {
          "Cache-Control": "public, max-age=604800, s-maxage=31536000, immutable",
          "Content-Type": "image/png",
        },
      },
    );
  } catch {
    // Ultimate fallback — render a plain dark branded splash rather than
    // returning an error (which would cause iOS to fall back to black).
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#18181B",
            backgroundImage:
              "radial-gradient(ellipse at 50% 42%, rgba(255,90,44,0.25) 0%, transparent 65%)",
          }}
        >
          <div
            style={{
              width: Math.round(Math.min(width, height) * 0.26),
              height: Math.round(Math.min(width, height) * 0.26),
              borderRadius: Math.round(Math.min(width, height) * 0.26 * 0.22),
              background: "#FF5A2C",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFFFFF",
              fontFamily: "system-ui, sans-serif",
              fontWeight: 700,
              fontSize: Math.round(Math.min(width, height) * 0.13),
            }}
          >
            R
          </div>
        </div>
      ),
      {
        width,
        height,
        headers: {
          "Cache-Control": "public, max-age=3600",
          "Content-Type": "image/png",
        },
      },
    );
  }
}
