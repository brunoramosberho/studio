import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { getServerBranding } from "@/lib/branding.server";

export async function GET(request: NextRequest) {
  const size = parseInt(request.nextUrl.searchParams.get("size") || "512", 10);

  try {
    const b = await getServerBranding();

    if (b.appIconUrl) {
      return new ImageResponse(
        (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: b.colorBg,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={b.appIconUrl}
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

    const initial = b.studioName.charAt(0).toUpperCase();
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
            background: b.colorBg,
            borderRadius: radius,
            fontFamily: "system-ui, sans-serif",
            fontWeight: 700,
            fontSize,
            color: b.colorAccent,
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
          R
        </div>
      ),
      { width: size, height: size },
    );
  }
}
