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
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "60px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "48px",
            width: "100%",
          }}
        >
          {iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={iconUrl}
              width={200}
              height={200}
              alt=""
              style={{
                borderRadius: 44,
                objectFit: "cover",
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 200,
                height: 200,
                borderRadius: 44,
                backgroundColor: brand.colorAccent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ color: "#FFFFFF", fontSize: 80, fontWeight: 700 }}>
                {initials}
              </span>
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              flex: 1,
            }}
          >
            <span
              style={{
                fontSize: 64,
                fontWeight: 700,
                color: "#1C1917",
                lineHeight: 1.1,
              }}
            >
              {brand.studioName}
            </span>
            <span
              style={{
                fontSize: 28,
                color: "#78716C",
                lineHeight: 1.4,
              }}
            >
              {brand.slogan}
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
