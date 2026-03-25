import { ImageResponse } from "next/og";
import { getServerBranding } from "@/lib/branding.server";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
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
            <img src={b.appIconUrl} width={180} height={180} style={{ objectFit: "contain" }} alt="" />
          </div>
        ),
        { ...size },
      );
    }

    const initial = b.studioName.charAt(0).toUpperCase();

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
            borderRadius: 36,
            fontFamily: "system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 80,
            color: b.colorAccent,
          }}
        >
          {initial}
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
          R
        </div>
      ),
      { ...size },
    );
  }
}
