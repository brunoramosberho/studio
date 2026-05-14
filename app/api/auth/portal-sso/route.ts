import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import {
  CLIENT_SESSION_COOKIE,
  ADMIN_SESSION_COOKIE,
} from "@/lib/auth";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
const rootHostname = ROOT_DOMAIN.split(":")[0];
const isProduction = process.env.NODE_ENV === "production";

// Promote a logged-in client session to an admin-portal session (same user)
// so /coach and /admin don't require a second login when the user already
// has a /my session and the required role/coach profile.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const rawTo = url.searchParams.get("to") ?? "/coach";
  const to = rawTo.startsWith("/") && !rawTo.startsWith("//") ? rawTo : "/coach";

  const loginUrl = new URL("/login", url);
  loginUrl.searchParams.set("portal", "admin");
  loginUrl.searchParams.set("callbackUrl", to);

  const clientToken =
    request.cookies.get(CLIENT_SESSION_COOKIE)?.value ??
    request.cookies.get("authjs.session-token")?.value ??
    request.cookies.get("__Secure-authjs.session-token")?.value;

  if (!clientToken) return NextResponse.redirect(loginUrl);

  const dbSession = await prisma.session.findUnique({
    where: { sessionToken: clientToken },
    select: { userId: true, expires: true },
  });

  if (!dbSession || dbSession.expires < new Date()) {
    return NextResponse.redirect(loginUrl);
  }

  const tenant = await getTenant();
  if (!tenant) return NextResponse.redirect(loginUrl);

  const [membership, coachProfile, user] = await Promise.all([
    prisma.membership.findUnique({
      where: { userId_tenantId: { userId: dbSession.userId, tenantId: tenant.id } },
      select: { role: true },
    }),
    prisma.coachProfile.findUnique({
      where: { userId_tenantId: { userId: dbSession.userId, tenantId: tenant.id } },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: dbSession.userId },
      select: { isSuperAdmin: true },
    }),
  ]);

  const role = membership?.role ?? "CLIENT";
  const isSuperAdmin = user?.isSuperAdmin ?? false;
  const isCoach = !!coachProfile || role === "COACH";
  const isStaff = role === "FRONT_DESK" || role === "ADMIN" || isSuperAdmin;

  const wantsCoach = to.startsWith("/coach");
  const allowed = wantsCoach ? isCoach || isStaff : isStaff;
  if (!allowed) return NextResponse.redirect(loginUrl);

  const sessionToken = crypto.randomUUID();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { sessionToken, userId: dbSession.userId, expires },
  });

  const response = NextResponse.redirect(new URL(to, url));
  response.cookies.set(ADMIN_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProduction,
    domain: isProduction ? `.${rootHostname}` : undefined,
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
