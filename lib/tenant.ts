import { headers } from "next/headers";
import { cache } from "react";
import { prisma } from "./db";
import { auth } from "./auth";
import type { Session } from "next-auth";
import type { Tenant, Membership, Role } from "@prisma/client";

export const TENANT_HEADER = "x-tenant-slug";
export const SUPER_ADMIN_SLUG = "__super_admin__";

// ── Tenant resolution (cached per request) ──

export const getTenantSlug = cache(async (): Promise<string | null> => {
  const h = await headers();
  return h.get(TENANT_HEADER);
});

export const getTenant = cache(async (): Promise<Tenant | null> => {
  const slug = await getTenantSlug();
  if (!slug || slug === SUPER_ADMIN_SLUG) return null;
  return prisma.tenant.findUnique({ where: { slug, isActive: true } });
});

export const requireTenant = cache(async (): Promise<Tenant> => {
  const tenant = await getTenant();
  if (!tenant) {
    throw new Error("Tenant not found");
  }
  return tenant;
});

// ── Membership helpers ──

export async function getMembership(
  userId: string,
  tenantId: string,
): Promise<Membership | null> {
  return prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });
}

export async function requireMembership(
  userId: string,
  tenantId: string,
  allowedRoles?: Role[],
): Promise<Membership> {
  const membership = await getMembership(userId, tenantId);
  if (!membership) {
    throw new Error("Not a member of this studio");
  }
  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw new Error("Insufficient role");
  }
  return membership;
}

// ── Combined auth + tenant context ──

export interface AuthContext {
  session: Session & { user: Session["user"] & { id: string } };
  tenant: Tenant;
  membership: Membership;
}

async function ensureMembership(
  userId: string,
  tenantId: string,
): Promise<Membership> {
  const existing = await getMembership(userId, tenantId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });
  const isSuperAdmin = user?.isSuperAdmin ?? false;

  if (existing) {
    if (isSuperAdmin && existing.role === "CLIENT") {
      return prisma.membership.update({
        where: { userId_tenantId: { userId, tenantId } },
        data: { role: "ADMIN" },
      });
    }
    return existing;
  }

  return prisma.membership.create({
    data: { userId, tenantId, role: isSuperAdmin ? "ADMIN" : "CLIENT" },
  });
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await auth() as Session | null;
  if (!session?.user?.id) return null;

  const tenant = await getTenant();
  if (!tenant) return null;

  const membership = await ensureMembership(session.user.id, tenant.id);

  return { session: session as AuthContext["session"], tenant, membership };
}

export async function requireAuth(): Promise<AuthContext> {
  const session = await auth() as Session | null;
  if (!session?.user?.id) throw new Error("Unauthorized");

  const tenant = await requireTenant();
  const membership = await ensureMembership(session.user.id, tenant.id);

  return { session: session as AuthContext["session"], tenant, membership };
}

export async function requireRole(...roles: Role[]): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!roles.includes(ctx.membership.role)) {
    throw new Error("Forbidden");
  }
  return ctx;
}

export async function requireSuperAdmin() {
  const session = await auth() as Session | null;
  if (!session?.user?.id) throw new Error("Unauthorized");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isSuperAdmin: true },
  });

  if (!user?.isSuperAdmin) throw new Error("Forbidden");

  return session;
}
