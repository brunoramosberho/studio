import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const size = parseInt(request.nextUrl.searchParams.get("size") || "512", 10);

  try {
    const settings = await prisma.studioSettings.findUnique({
      where: { id: "singleton" },
      select: { appIconUrl: true, studioName: true, colorBg: true, colorAccent: true },
    });

    const iconUrl = settings?.appIconUrl;

    if (iconUrl) {
      return new ImageResponse(
        (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={iconUrl}
              width={size}
              height={size}
              style={{ objectFit: "contain" }}
              alt=""
            />
          </div>
        ),
        { width: size, height: size },
      );
    }

    const name = settings?.studioName || "S";
    const bg = settings?.colorBg || "#FAF9F6";
    const fg = settings?.colorAccent || "#1C1917";
    const initial = name.charAt(0).toUpperCase();
    const fontSize = Math.round(size * 0.45);
    const radius = Math.round(size * 0.2);

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: bg,
            borderRadius: radius,
            fontFamily: "system-ui, sans-serif",
            fontWeight: 700,
            fontSize,
            color: fg,
          }}
        >
          {initial}
        </div>
      ),
      { width: size, height: size },
    );
  } catch {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#FAF9F6",
            borderRadius: 40,
            fontFamily: "system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 200,
            color: "#1C1917",
          }}
        >
          S
        </div>
      ),
      { width: size, height: size },
    );
  }
}
