import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

const MAX_ATTEMPTS = 5;

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
const rootHostname = ROOT_DOMAIN.split(":")[0];
const isProduction = process.env.NODE_ENV === "production";

function sessionCookieName(portal: string) {
  const suffix = portal === "admin" ? ".admin" : "";
  return isProduction
    ? `__Secure-authjs.session-token${suffix}`
    : `authjs.session-token${suffix}`;
}

export async function POST(request: NextRequest) {
  try {
    const { email, code, portal = "client" } = await request.json();
    if (!email || !code) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedCode = code.replace(/\s/g, "").trim();

    // Find the latest pending login for this email
    const pending = await prisma.pendingLogin.findFirst({
      where: {
        email: normalizedEmail,
        approved: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!pending) {
      return NextResponse.json({ error: "expired" }, { status: 400 });
    }

    // Brute-force protection
    if (pending.attempts >= MAX_ATTEMPTS) {
      await prisma.pendingLogin.delete({ where: { id: pending.id } });
      return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
    }

    // Verify code
    if (pending.token !== normalizedCode) {
      await prisma.pendingLogin.update({
        where: { id: pending.id },
        data: { attempts: { increment: 1 } },
      });
      const remaining = MAX_ATTEMPTS - pending.attempts - 1;
      return NextResponse.json(
        { error: "invalid_code", remaining },
        { status: 400 },
      );
    }

    // Code is valid — find the user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 400 });
    }

    // Mark email as verified (they proved ownership)
    if (!user.emailVerified) {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });
    }

    // Create database session
    const sessionToken = crypto.randomUUID();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: { sessionToken, userId: user.id, expires },
    });

    // Clean up pending login
    await prisma.pendingLogin.delete({ where: { id: pending.id } });

    // Set session cookie server-side (matching NextAuth's cookie config)
    const response = NextResponse.json({ success: true });
    response.cookies.set(sessionCookieName(portal), sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: isProduction,
      domain: isProduction ? `.${rootHostname}` : undefined,
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error("POST /api/auth/verify-otp error:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
