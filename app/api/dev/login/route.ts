import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { randomUUID } from "crypto";

export async function GET(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEV_LOGIN) {
      return NextResponse.json({ error: "Not available in production" }, { status: 403 });
    }

    const role = request.nextUrl.searchParams.get("role") || "ADMIN";

    const user = await prisma.user.findFirst({
      where: {
        role: role as "ADMIN" | "COACH" | "CLIENT",
        NOT: [
          { email: { contains: "filler" } },
          { email: { contains: "waitlist" } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    if (!user) {
      return NextResponse.json(
        { error: `No user with role ${role} found. Run prisma seed first.` },
        { status: 404 },
      );
    }

    const sessionToken = randomUUID();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    const redirectMap: Record<string, string> = {
      ADMIN: "/admin",
      COACH: "/coach",
      CLIENT: "/my",
    };

    const response = NextResponse.redirect(new URL(redirectMap[role] || "/", request.url));
    response.cookies.set("authjs.session-token", sessionToken, {
      expires,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });

    return response;
  } catch (error) {
    console.error("Dev login error:", error);
    return NextResponse.json(
      {
        error: "Dev login failed",
        details: error instanceof Error ? error.message : String(error),
        db_url_set: !!process.env.DATABASE_URL,
        allow_dev: !!process.env.ALLOW_DEV_LOGIN,
      },
      { status: 500 },
    );
  }
}
