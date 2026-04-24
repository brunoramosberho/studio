import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { getServerBranding } from "@/lib/branding.server";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon() {
  const h = await headers();
  const isApex = !h.get("x-tenant-slug");

  if (isApex) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "linear-gradient(135deg, #F97316 0%, #EA580C 60%, #DC2626 100%)",
            borderRadius: 7,
            fontFamily: "system-ui, sans-serif",
            fontWeight: 800,
            fontSize: 22,
            color: "white",
            letterSpacing: -1,
          }}
        >
          M
        </div>
      ),
      { ...size },
    );
  }

  try {
    const b = await getServerBranding();
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
            borderRadius: 7,
            fontFamily: "system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 22,
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
            background:
              "linear-gradient(135deg, #F97316 0%, #EA580C 60%, #DC2626 100%)",
            borderRadius: 7,
            fontFamily: "system-ui, sans-serif",
            fontWeight: 800,
            fontSize: 22,
            color: "white",
          }}
        >
          M
        </div>
      ),
      { ...size },
    );
  }
}
