import { headers } from "next/headers";
import { cache } from "react";
import { prisma } from "./db";
import { auth, adminAuth } from "./auth";
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

// ── Role hierarchy ──

const ROLE_RANK: Record<Role, number> = { CLIENT: 0, COACH: 1, FRONT_DESK: 2, ADMIN: 3 };

export function roleAtLeast(userRole: Role, minimumRole: Role): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[minimumRole];
}

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
  if (allowedRoles && !allowedRoles.some((r) => roleAtLeast(membership.role, r))) {
    throw new Error("Insufficient role");
  }
  return membership;
}

// ── Portal-aware session resolution ──

async function resolveSession(): Promise<Session | null> {
  const h = await headers();
  const portal = h.get("x-auth-portal");

  if (portal === "admin") return adminAuth() as Promise<Session | null>;
  if (portal === "client") {
    const clientSession = (await auth()) as (Session & { user?: { id?: string } }) | null;
    if (clientSession?.user?.id) return clientSession as Session;
    return adminAuth() as Promise<Session | null>;
  }

  const clientSession = (await auth()) as (Session & { user?: { id?: string } }) | null;
  if (clientSession?.user?.id) return clientSession as Session;
  return adminAuth() as Promise<Session | null>;
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

const LAST_SEEN_THROTTLE_MS = 60 * 60 * 1000; // 1 hour

function touchLastSeen(membership: Membership): void {
  const now = new Date();
  if (
    membership.lastSeenAt &&
    now.getTime() - membership.lastSeenAt.getTime() < LAST_SEEN_THROTTLE_MS
  ) {
    return;
  }
  prisma.membership
    .update({
      where: { userId_tenantId: { userId: membership.userId, tenantId: membership.tenantId } },
      data: { lastSeenAt: now },
    })
    .catch(() => {});
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await resolveSession();
  if (!session?.user?.id) return null;

  const tenant = await getTenant();
  if (!tenant) return null;

  const membership = await ensureMembership(session.user.id, tenant.id);
  touchLastSeen(membership);

  return { session: session as AuthContext["session"], tenant, membership };
}

export async function requireAuth(): Promise<AuthContext> {
  const session = await resolveSession();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const tenant = await requireTenant();
  const membership = await ensureMembership(session.user.id, tenant.id);
  touchLastSeen(membership);

  return { session: session as AuthContext["session"], tenant, membership };
}

export async function requireRole(...roles: Role[]): Promise<AuthContext> {
  const ctx = await requireAuth();
  const hasRole = roles.some((r) => roleAtLeast(ctx.membership.role, r));
  if (!hasRole) throw new Error("Forbidden");
  return ctx;
}

export async function requireSuperAdmin() {
  const session = await resolveSession();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isSuperAdmin: true },
  });

  if (!user?.isSuperAdmin) throw new Error("Forbidden");

  return session;
}
