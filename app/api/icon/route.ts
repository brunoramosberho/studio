import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const size = parseInt(request.nextUrl.searchParams.get("size") || "512", 10);

  try {
    const settings = await prisma.studioSettings.findUnique({
      where: { id: "singleton" },
      select: { appIconUrl: true, studioName: true, colorBg: true, colorAccent: true },
    });

    const iconUrl = settings?.appIconUrl;

    if (iconUrl?.startsWith("data:")) {
      const match = iconUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const contentType = match[1];
        const buffer = Buffer.from(match[2], "base64");
        return new NextResponse(buffer, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    }

    if (iconUrl?.startsWith("http")) {
      return NextResponse.redirect(iconUrl);
    }

    const name = settings?.studioName || "S";
    const bg = settings?.colorBg || "#FAF9F6";
    const fg = settings?.colorAccent || "#1C1917";
    const initial = name.charAt(0).toUpperCase();
    const fontSize = Math.round(size * 0.45);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" fill="${bg}"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
    font-family="system-ui,sans-serif" font-weight="700" font-size="${fontSize}" fill="${fg}">${initial}</text>
</svg>`;

    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Icon not found", { status: 404 });
  }
}
