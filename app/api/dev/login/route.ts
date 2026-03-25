import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { randomUUID } from "crypto";
import { getTenant } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEV_LOGIN) {
      return NextResponse.json({ error: "Not available in production" }, { status: 403 });
    }

    const role = request.nextUrl.searchParams.get("role") || "ADMIN";
    const tenant = await getTenant();

    let user;
    if (tenant) {
      const membership = await prisma.membership.findFirst({
        where: {
          tenantId: tenant.id,
          role: role as "ADMIN" | "COACH" | "CLIENT",
          user: {
            NOT: [
              { email: { contains: "filler" } },
              { email: { contains: "waitlist" } },
            ],
          },
        },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      });
      user = membership?.user;
    } else {
      user = await prisma.user.findFirst({
        where: {
          role: role as "ADMIN" | "COACH" | "CLIENT",
          NOT: [
            { email: { contains: "filler" } },
            { email: { contains: "waitlist" } },
          ],
        },
        orderBy: { createdAt: "asc" },
      });
    }

    if (!user) {
      return NextResponse.json(
        { error: `No user with role ${role} found.` },
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
    const isSecure = request.url.startsWith("https://");
    const cookieName = isSecure
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";

    const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
    const rootHostname = ROOT_DOMAIN.split(":")[0];

    response.cookies.set(cookieName, sessionToken, {
      expires,
      path: "/",
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      domain: isSecure ? `.${rootHostname}` : undefined,
    });

    return response;
  } catch (error) {
    console.error("Dev login error:", error);
    return NextResponse.json(
      {
        error: "Dev login failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
