import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireRole } from "@/lib/tenant";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export async function GET() {
  try {
    await requireRole("ADMIN");

    const appId = mustEnv("META_APP_ID");
    const redirectUri = mustEnv("META_IG_REDIRECT_URI");

    const state = crypto.randomUUID();
    const jar = await cookies();
    jar.set("ig_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 10,
      path: "/",
    });

    // Facebook Login → IG Graph (business/creator). Scopes for reading media.
    const url = new URL("https://www.facebook.com/v20.0/dialog/oauth");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set(
      "scope",
      [
        "pages_show_list",
        "pages_read_engagement",
        "instagram_basic",
        "instagram_manage_insights",
      ].join(","),
    );
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);

    return NextResponse.redirect(url.toString());
  } catch (error) {
    console.error("GET /api/admin/instagram/connect error:", error);
    return NextResponse.json(
      { error: "Instagram connect is not configured" },
      { status: 400 },
    );
  }
}

