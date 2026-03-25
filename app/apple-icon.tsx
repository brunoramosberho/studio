import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  try {
    const settings = await prisma.studioSettings.findUnique({
      where: { id: "singleton" },
      select: { appIconUrl: true, studioName: true, colorBg: true, colorAccent: true },
    });

    const iconUrl = settings?.appIconUrl;
    const bg = settings?.colorBg || "#FAF9F6";

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
              background: bg,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={iconUrl} width={180} height={180} style={{ objectFit: "contain" }} alt="" />
          </div>
        ),
        { ...size },
      );
    }

    const name = settings?.studioName || "S";
    const bg = settings?.colorBg || "#FAF9F6";
    const fg = settings?.colorAccent || "#1C1917";

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
            borderRadius: 36,
            fontFamily: "system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 80,
            color: fg,
          }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
      ),
      { ...size },
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
            borderRadius: 36,
            fontFamily: "system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 80,
            color: "#1C1917",
          }}
        >
          S
        </div>
      ),
      { ...size },
    );
  }
}
