/**
 * TEMPORARY diagnostic — dumps what the server sees in the request cookies
 * and whether the session token resolves to a valid Session row in the DB.
 *
 * Hit `https://<tenant>.mgic.app/api/debug-cookie` while you have a problem
 * to see exactly what NextAuth would see.
 *
 * Returns no PII other than truncated token prefixes. Safe to leave deployed
 * briefly while debugging; should be deleted after the bug is fixed.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CLIENT_SESSION_COOKIE, ADMIN_SESSION_COOKIE } from "@/lib/auth";
import { headers } from "next/headers";

export async function GET(request: NextRequest) {
  const h = await headers();
  const host = h.get("host");
  const cookieNames = request.cookies
    .getAll()
    .map((c) => c.name)
    .sort();

  const clientName = CLIENT_SESSION_COOKIE;
  const adminName = ADMIN_SESSION_COOKIE;

  const clientToken = request.cookies.get(clientName)?.value;
  const adminToken = request.cookies.get(adminName)?.value;

  async function lookupSession(token: string | undefined) {
    if (!token) return { present: false };
    const session = await prisma.session.findUnique({
      where: { sessionToken: token },
      select: {
        id: true,
        userId: true,
        expires: true,
      },
    });
    return {
      present: true,
      tokenPrefix: token.slice(0, 8) + "...",
      foundInDb: !!session,
      sessionId: session?.id ?? null,
      userId: session?.userId ?? null,
      expires: session?.expires ?? null,
      expired: session ? session.expires < new Date() : null,
    };
  }

  const [clientLookup, adminLookup] = await Promise.all([
    lookupSession(clientToken),
    lookupSession(adminToken),
  ]);

  // Also count total sessions for that user (if either cookie resolved)
  const userId = clientLookup.userId ?? adminLookup.userId;
  const allUserSessions = userId
    ? await prisma.session.count({
        where: { userId, expires: { gt: new Date() } },
      })
    : null;

  return NextResponse.json(
    {
      host,
      tenantSlugHeader: h.get("x-tenant-slug"),
      authPortalHeader: h.get("x-auth-portal"),
      cookieNamesOnRequest: cookieNames,
      expected: { clientCookieName: clientName, adminCookieName: adminName },
      client: clientLookup,
      admin: adminLookup,
      validSessionsForUser: allUserSessions,
      now: new Date(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
