import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { randomUUID } from "crypto";
import { getTenant } from "@/lib/tenant";
import type { Role } from "@prisma/client";

function fillerUserWhere() {
  return {
    NOT: [
      { email: { contains: "filler" } },
      { email: { contains: "waitlist" } },
    ],
  };
}

function devLoginEmailForRole(role: string, tenantSlug?: string): string | undefined {
  const suffix = tenantSlug?.toUpperCase().replace(/-/g, "_");
  const coachPerTenant = suffix ? process.env[`DEV_LOGIN_COACH_EMAIL__${suffix}`]?.trim() : undefined;
  const clientPerTenant = suffix ? process.env[`DEV_LOGIN_CLIENT_EMAIL__${suffix}`]?.trim() : undefined;
  const coach = coachPerTenant || process.env.DEV_LOGIN_COACH_EMAIL?.trim();
  const client = clientPerTenant || process.env.DEV_LOGIN_CLIENT_EMAIL?.trim();
  if (role === "COACH" && coach) return coach;
  if (role === "CLIENT" && client) return client;
  return undefined;
}

export async function GET(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEV_LOGIN) {
      return NextResponse.json({ error: "Not available in production" }, { status: 403 });
    }

    const role = request.nextUrl.searchParams.get("role") || "ADMIN";
    const tenant = await getTenant();

    const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
    const rootHostname = ROOT_DOMAIN.split(":")[0];
    const host = request.headers.get("host") || ROOT_DOMAIN;
    const isSecure = request.url.startsWith("https://");
    const protocol = isSecure ? "https" : "http";

    let user;

    if (role === "SUPER_ADMIN") {
      // Find an existing admin user (prefer one with isSuperAdmin already set)
      user = await prisma.user.findFirst({
        where: { isSuperAdmin: true },
        orderBy: { createdAt: "asc" },
      });

      if (!user) {
        // Promote the first admin membership holder to super admin
        const adminMembership = await prisma.membership.findFirst({
          where: { role: "ADMIN" },
          include: { user: true },
          orderBy: { createdAt: "asc" },
        });
        if (adminMembership) {
          user = await prisma.user.update({
            where: { id: adminMembership.user.id },
            data: { isSuperAdmin: true },
          });
        }
      }
    } else if (tenant) {
      const tenantRole = role as "ADMIN" | "COACH" | "CLIENT";
      const preferEmail = devLoginEmailForRole(role, tenant.slug);

      if (preferEmail) {
        const byEmail = await prisma.membership.findFirst({
          where: {
            tenantId: tenant.id,
            role: tenantRole,
            user: {
              email: { equals: preferEmail, mode: "insensitive" },
              ...fillerUserWhere(),
            },
          },
          include: { user: true },
        });
        user = byEmail?.user;
      }

      if (!user) {
        const membership = await prisma.membership.findFirst({
          where: {
            tenantId: tenant.id,
            role: tenantRole,
            user: fillerUserWhere(),
          },
          include: { user: true },
          orderBy: { createdAt: "asc" },
        });
        user = membership?.user;
      }
    } else {
      const preferEmail = devLoginEmailForRole(role);
      const legacyRole = role as Role;

      if (preferEmail) {
        user = await prisma.user.findFirst({
          where: {
            role: legacyRole,
            email: { equals: preferEmail, mode: "insensitive" },
            ...fillerUserWhere(),
          },
        });
      }

      if (!user) {
        user = await prisma.user.findFirst({
          where: {
            role: legacyRole,
            ...fillerUserWhere(),
          },
          orderBy: { createdAt: "asc" },
        });
      }
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

    const isStaffRole = role === "ADMIN" || role === "COACH";
    const redirectPath = role === "SUPER_ADMIN" ? "/" : (redirectMap[role] || "/");
    const redirectUrl = new URL(redirectPath, `${protocol}://${host}`);
    const response = NextResponse.redirect(redirectUrl);

    const cookieSuffix = isStaffRole ? ".admin" : "";
    const cookieName = isSecure
      ? `__Secure-authjs.session-token${cookieSuffix}`
      : `authjs.session-token${cookieSuffix}`;

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
