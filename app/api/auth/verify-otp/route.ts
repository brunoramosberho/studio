import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

const MAX_ATTEMPTS = 5;
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
const rootHostname = ROOT_DOMAIN.split(":")[0];
const isProduction = process.env.NODE_ENV === "production";

function sessionCookieName(kind: "client" | "admin") {
  const suffix = kind === "admin" ? ".admin" : "";
  return isProduction
    ? `__Secure-authjs.session-token${suffix}`
    : `authjs.session-token${suffix}`;
}

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: isProduction,
    domain: isProduction ? `.${rootHostname}` : undefined,
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

async function createSessionFor(userId: string) {
  const sessionToken = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await prisma.session.create({ data: { sessionToken, userId, expires } });
  return sessionToken;
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

    // Clean up pending login
    await prisma.pendingLogin.delete({ where: { id: pending.id } });

    const response = NextResponse.json({ success: true });

    // Set the cookie for the portal the user explicitly logged into.
    const primaryToken = await createSessionFor(user.id);
    response.cookies.set(
      sessionCookieName(portal === "admin" ? "admin" : "client"),
      primaryToken,
      cookieOpts(),
    );

    // Coach == client. If the user is a coach on this tenant, set BOTH
    // cookies in one shot so future cross-portal navigation never needs a
    // re-login. Pure admins (staff without a CoachProfile) only get the
    // admin cookie — admins don't enter as clients (per studio rules).
    //
    // Tenant comes from the middleware header so we only grant the extra
    // cookie for the studio the user is actually visiting.
    const tenantSlug = request.headers.get("x-tenant-slug");
    if (tenantSlug && tenantSlug !== "__super_admin__") {
      const tenant = await prisma.tenant.findUnique({
        where: { slug: tenantSlug, isActive: true },
        select: { id: true },
      });
      if (tenant) {
        const [membership, coachProfile] = await Promise.all([
          prisma.membership.findUnique({
            where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
            select: { role: true },
          }),
          prisma.coachProfile.findUnique({
            where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
            select: { id: true },
          }),
        ]);
        const isCoach = !!coachProfile || membership?.role === "COACH";

        if (portal === "admin" && isCoach) {
          // Coach signed in via /coach — also give them the client cookie
          // so opening /my (or the /my PWA) doesn't bounce them out.
          const clientToken = await createSessionFor(user.id);
          response.cookies.set(
            sessionCookieName("client"),
            clientToken,
            cookieOpts(),
          );
        } else if (portal !== "admin" && isCoach) {
          // Coach signed in via /my — also give them the admin cookie so
          // /coach is one tap away.
          const adminToken = await createSessionFor(user.id);
          response.cookies.set(
            sessionCookieName("admin"),
            adminToken,
            cookieOpts(),
          );
        }
      }
    }

    return response;
  } catch (error) {
    console.error("POST /api/auth/verify-otp error:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
