import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const size = parseInt(searchParams.get("size") || "512", 10);

  let studioName = "Flō";
  let colorBg = "#FAF9F6";
  let colorAccent = "#C9A96E";
  let appIconUrl: string | null = null;

  try {
    const settings = await prisma.studioSettings.findUnique({
      where: { id: "singleton" },
    });
    if (settings) {
      studioName = settings.studioName;
      colorBg = settings.colorBg;
      colorAccent = settings.colorAccent;
      appIconUrl = settings.appIconUrl;
    }
  } catch {}

  if (appIconUrl) {
    try {
      const res = await fetch(appIconUrl);
      if (res.ok) {
        return new Response(await res.arrayBuffer(), {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    } catch {}
  }

  const letter = studioName.charAt(0).toUpperCase();
  const fontSize = Math.round(size * 0.48);

  let fontData: ArrayBuffer | undefined;
  try {
    const fontRes = await fetch(
      "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff",
    );
    if (fontRes.ok) fontData = await fontRes.arrayBuffer();
  } catch {}

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colorBg,
        }}
      >
        <span
          style={{
            fontSize,
            fontWeight: 700,
            fontFamily: "Inter",
            color: colorAccent,
            lineHeight: 1,
          }}
        >
          {letter}
        </span>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        "Cache-Control": "public, max-age=86400",
      },
      ...(fontData
        ? {
            fonts: [
              {
                name: "Inter",
                data: fontData,
                weight: 700 as const,
                style: "normal" as const,
              },
            ],
          }
        : {}),
    },
  );
}
