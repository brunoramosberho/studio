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
import { CLIENT_SESSION_COOKIE, ADMIN_SESSION_COOKIE, auth } from "@/lib/auth";
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

  // What does NextAuth's `auth()` itself return? If this is null while the
  // cookie + DB session are valid, the bug is in the sessionCallback or the
  // adapter call, not in cookie scoping.
  let authResult: unknown;
  let authError: string | null = null;
  try {
    const session = await auth();
    authResult = session
      ? {
          userId: (session as { user?: { id?: string } }).user?.id ?? null,
          expires: (session as { expires?: string }).expires ?? null,
          hasUser: !!(session as { user?: unknown }).user,
        }
      : null;
  } catch (e) {
    authError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }

  // Manually reproduce what NextAuth's auth() does so we can see exactly
  // which step returns null. The Prisma adapter's getSessionAndUser is
  // basically: find Session by token, then find related User. If the session
  // expires < now, NextAuth deletes it and returns null. If sessionCallback
  // returns null/undefined, NextAuth also returns null.
  let manualUser: unknown = null;
  let manualSessionCallbackResult: unknown = null;
  let manualError: string | null = null;
  try {
    if (clientToken && clientLookup.userId) {
      const user = await prisma.user.findUnique({
        where: { id: clientLookup.userId },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          isSuperAdmin: true,
        },
      });
      manualUser = user
        ? {
            id: user.id,
            hasName: !!user.name,
            hasEmail: !!user.email,
            isSuperAdmin: user.isSuperAdmin,
          }
        : null;

      if (user) {
        // Replicate the inputs that NextAuth would pass to sessionCallback.
        const session = {
          user: { name: user.name, email: user.email, image: user.image },
          expires: clientLookup.expires?.toISOString?.() ?? null,
        };
        manualSessionCallbackResult = {
          inputHadUser: !!session.user,
          inputExpires: session.expires,
          // We don't import the callback directly to avoid circular imports;
          // we just confirm the inputs that would be passed.
        };
      }
    }
  } catch (e) {
    manualError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }

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
      authResult,
      authError,
      manualUser,
      manualSessionCallbackResult,
      manualError,
      env: {
        hasAuthSecret: !!process.env.AUTH_SECRET,
        hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
        hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
        nextAuthUrl: process.env.NEXTAUTH_URL ?? null,
        rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? null,
        nodeEnv: process.env.NODE_ENV ?? null,
      },
      now: new Date(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
