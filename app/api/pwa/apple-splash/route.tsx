import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";

// Node.js runtime keeps things predictable even though this route no
// longer needs Prisma — Vercel's edge can occasionally misbehave with
// ImageResponse and we prefer the more forgiving Node runtime here.
export const runtime = "nodejs";

/**
 * Dynamic Apple PWA splash screen generator.
 *
 * Pure rendering — does NOT resolve branding server-side. Colors and
 * the initial letter are passed via query params so the route cannot
 * fail due to DB issues, tenant lookup, or cold-start latency. iOS is
 * unforgiving: if this route ever errors out, iOS falls back to a flat
 * white launch frame.
 *
 * Query params:
 *   - w: pixel width (matches the device resolution)
 *   - h: pixel height
 *   - bg: background color (hex, URL-encoded #). Defaults to #18181B.
 *   - a:  accent color for the glow + icon tile. Defaults to #FF5A2C.
 *   - i:  initial letter rendered on the tile. Defaults to "·".
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const rawW = parseInt(params.get("w") || "1170", 10);
  const rawH = parseInt(params.get("h") || "2532", 10);
  const width = Math.min(Math.max(rawW || 1170, 320), 3000);
  const height = Math.min(Math.max(rawH || 2532, 320), 3000);

  const bg = sanitizeHex(params.get("bg")) ?? "#18181B";
  const accent = sanitizeHex(params.get("a")) ?? "#FF5A2C";
  const initial = (params.get("i") || "·").charAt(0).toUpperCase();

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
          background: `radial-gradient(ellipse at 50% 42%, ${accent}40 0%, ${bg} 70%)`,
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

/** Accept only `#RRGGBB` (with or without the leading #), else return null. */
function sanitizeHex(input: string | null): string | null {
  if (!input) return null;
  const raw = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  return `#${raw}`;
}
