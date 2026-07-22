import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import {
  recordShareClick,
  SHARE_COOKIE,
  SHARE_COOKIE_MAX_AGE,
} from "@/lib/growth/share-links";

// A visitor landed on a member's share link (?ref=CODE). Record the click and
// hand back a 30-day cookie so a later purchase/booking attributes to the
// sharer. Invalid codes are a silent no-op — never an error the visitor sees.
export async function POST(req: NextRequest) {
  try {
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json({ ok: false });

    const { code, path } = await req.json();
    if (!code || typeof code !== "string") {
      return NextResponse.json({ ok: false });
    }

    const valid = await recordShareClick({
      tenantId: tenant.id,
      code,
      path: typeof path === "string" ? path : null,
    });
    if (!valid) return NextResponse.json({ ok: false });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SHARE_COOKIE, code, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SHARE_COOKIE_MAX_AGE,
      path: "/",
    });
    return res;
  } catch (error) {
    console.error("POST /api/share/click error:", error);
    return NextResponse.json({ ok: false });
  }
}
