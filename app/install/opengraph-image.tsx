import { ImageResponse } from "next/og";
import { getServerBranding } from "@/lib/branding.server";

export const alt = "Instala la App";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const brand = await getServerBranding();

  const iconUrl = brand.appIconUrl;
  const initials = brand.studioName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const titleLine = brand.slogan
    ? `${brand.studioName}: ${brand.slogan}`
    : brand.studioName;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FFFFFF",
          fontFamily:
            '-apple-system, "SF Pro Text", "SF Pro Display", system-ui, sans-serif',
        }}
      >
        {/* App Store row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            padding: "0 80px",
            gap: "36px",
          }}
        >
          {/* Icon */}
          {iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={iconUrl}
              width={148}
              height={148}
              alt=""
              style={{
                borderRadius: 33,
                objectFit: "cover",
                flexShrink: 0,
                border: "1px solid rgba(0,0,0,0.08)",
              }}
            />
          ) : (
            <div
              style={{
                width: 148,
                height: 148,
                borderRadius: 33,
                backgroundColor: brand.colorAccent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ color: "#FFF", fontSize: 60, fontWeight: 700 }}>
                {initials}
              </span>
            </div>
          )}

          {/* Text */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              gap: "6px",
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: 38,
                fontWeight: 600,
                color: "#000000",
                lineHeight: 1.25,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {titleLine}
            </span>
            <span
              style={{
                fontSize: 30,
                fontWeight: 400,
                color: "#8E8E93",
                lineHeight: 1.3,
              }}
            >
              {brand.tagline}
            </span>
          </div>

          {/* Install button (App Store style) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#007AFF",
              borderRadius: 9999,
              padding: "16px 44px",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: "#FFFFFF",
                letterSpacing: "0.3px",
              }}
            >
              Instalar
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
