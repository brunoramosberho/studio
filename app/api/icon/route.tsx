import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

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
    const res = await fetch(appIconUrl);
    if (res.ok) {
      return new Response(await res.arrayBuffer(), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }
  }

  const letter = studioName.charAt(0).toUpperCase();
  const fontSize = Math.round(size * 0.48);

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
          borderRadius: size * 0.22,
        }}
      >
        <span
          style={{
            fontSize,
            fontWeight: 700,
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
    },
  );
}
