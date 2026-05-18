import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import {
  CLIENT_SESSION_COOKIE,
  ADMIN_SESSION_COOKIE,
} from "@/lib/auth";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
const rootHostname = ROOT_DOMAIN.split(":")[0];
const isProduction = process.env.NODE_ENV === "production";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

// Bridge a session between the two portals (same user, parallel Session row)
// so the user doesn't have to re-login when one cookie survives but the
// other doesn't. Direction is inferred from `to`:
//   - to=/coach or /admin → uses the client cookie to mint an admin cookie
//   - to=/my              → uses the admin cookie to mint a client cookie
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const rawTo = url.searchParams.get("to") ?? "/coach";
  const to = rawTo.startsWith("/") && !rawTo.startsWith("//") ? rawTo : "/coach";
  const wantsClient = to.startsWith("/my");

  const loginUrl = new URL("/login", url);
  if (!wantsClient) loginUrl.searchParams.set("portal", "admin");
  loginUrl.searchParams.set("callbackUrl", to);

  const sourceCookieName = wantsClient ? ADMIN_SESSION_COOKIE : CLIENT_SESSION_COOKIE;
  const targetCookieName = wantsClient ? CLIENT_SESSION_COOKIE : ADMIN_SESSION_COOKIE;

  const sourceToken =
    request.cookies.get(sourceCookieName)?.value ??
    // Fallback for the non-prefixed dev cookie variant.
    (wantsClient
      ? request.cookies.get("authjs.admin.session-token")?.value
      : request.cookies.get("authjs.client.session-token")?.value);

  if (!sourceToken) return NextResponse.redirect(loginUrl);

  const dbSession = await prisma.session.findUnique({
    where: { sessionToken: sourceToken },
    select: { userId: true, expires: true },
  });

  if (!dbSession || dbSession.expires < new Date()) {
    return NextResponse.redirect(loginUrl);
  }

  // Resolve the tenant from the middleware-injected header first; fall
  // back to parsing the Host header so this works even if the header
  // forwarding is flaky for any reason.
  let tenantSlug = request.headers.get("x-tenant-slug");
  if (!tenantSlug) {
    const host = request.headers.get("host") ?? "";
    const hostname = host.split(":")[0];
    if (
      hostname !== rootHostname &&
      hostname !== `www.${rootHostname}` &&
      hostname.endsWith(`.${rootHostname}`)
    ) {
      tenantSlug = hostname.replace(`.${rootHostname}`, "");
    }
  }
  const tenant = tenantSlug
    ? await prisma.tenant.findUnique({
        where: { slug: tenantSlug, isActive: true },
        select: { id: true },
      })
    : null;
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

  // Access rules (studio policy):
  //   /admin  → staff only (ADMIN / FRONT_DESK / superadmin)
  //   /coach  → coaches only (must have CoachProfile or COACH role)
  //   /my     → clients and coaches-who-are-clients; never staff
  const allowed = wantsClient
    ? !!membership && !isStaff
    : wantsCoach
      ? isCoach
      : isStaff;
  if (!allowed) return NextResponse.redirect(loginUrl);

  const sessionToken = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await prisma.session.create({
    data: { sessionToken, userId: dbSession.userId, expires },
  });

  const response = NextResponse.redirect(new URL(to, url));
  response.cookies.set(targetCookieName, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProduction,
    domain: isProduction ? `.${rootHostname}` : undefined,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
