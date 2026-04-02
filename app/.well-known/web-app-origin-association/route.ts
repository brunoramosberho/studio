import { NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET() {
  const h = await headers();
  const host = h.get("host") || process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";

  const association = {
    web_apps: [
      {
        manifest: `${protocol}://${host}/api/manifest`,
        details: {
          paths: ["/*"],
        },
      },
    ],
  };

  return NextResponse.json(association, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
