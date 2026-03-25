import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import sharp from "sharp";

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
        const raw = Buffer.from(match[2], "base64");
        const png = await sharp(raw)
          .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        return new NextResponse(new Uint8Array(png), {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    }

    if (iconUrl?.startsWith("http")) {
      try {
        const res = await fetch(iconUrl);
        if (!res.ok) throw new Error("fetch failed");
        const raw = Buffer.from(await res.arrayBuffer());
        const png = await sharp(raw)
          .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        return new NextResponse(new Uint8Array(png), {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=86400",
          },
        });
      } catch {
        return NextResponse.redirect(iconUrl);
      }
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

    const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Icon not found", { status: 404 });
  }
}
