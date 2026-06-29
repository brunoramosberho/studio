import "server-only";
import { prisma } from "@/lib/db";
import { getBrandingForTenantId } from "@/lib/branding.server";
import { generateMembershipPass } from "./apple-pass";
import { applePassAuthToken } from "./config";

/**
 * Fetches a member's pass data and generates the signed `.pkpass`. Shared by the
 * member-facing route and the PassKit web service (which Apple calls without a
 * session, so this takes ids, not the request context).
 *
 * Returns `null` when the member has no active membership and `voidedIfInactive`
 * is false (the member route 403s). When `voidedIfInactive` is true, an inactive
 * member still gets a pass — rendered as voided — so a cancelled membership
 * updates to "expired" on the device instead of going stale.
 */
export async function buildMembershipPass(opts: {
  tenantId: string;
  userId: string;
  /** Base URL of the web service; when set the pass is registered for updates. */
  webServiceURL?: string;
  voidedIfInactive?: boolean;
}): Promise<{ buffer: Buffer; serialNumber: string; voided: boolean } | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: opts.tenantId },
    select: { slug: true },
  });
  if (!tenant) return null;
  const serialNumber = `${tenant.slug}.${opts.userId}`;

  const activeSub = await prisma.userPackage.findFirst({
    where: {
      userId: opts.userId,
      tenantId: opts.tenantId,
      expiresAt: { gt: new Date() },
      package: { type: "SUBSCRIPTION" },
    },
    include: { package: { select: { name: true } } },
    orderBy: { expiresAt: "desc" },
  });

  const voided = !activeSub;
  if (voided && !opts.voidedIfInactive) return null;

  const [progress, user, membership, gamConfig, branding] = await Promise.all([
    prisma.memberProgress.findUnique({
      where: { userId_tenantId: { userId: opts.userId, tenantId: opts.tenantId } },
      include: { currentLevel: true },
    }),
    prisma.user.findUnique({ where: { id: opts.userId }, select: { name: true, image: true } }),
    prisma.membership.findFirst({
      where: { userId: opts.userId, tenantId: opts.tenantId },
      select: { createdAt: true },
    }),
    prisma.tenantGamificationConfig.findUnique({ where: { tenantId: opts.tenantId } }),
    getBrandingForTenantId(opts.tenantId),
  ]);

  const levelOverrides = (gamConfig?.levelOverrides ?? {}) as Record<string, { name?: string }>;
  const levelsEnabled = gamConfig?.levelsEnabled ?? true;
  const rawLevel = progress?.currentLevel ?? null;
  const levelName =
    levelsEnabled && rawLevel
      ? levelOverrides[String(rawLevel.sortOrder)]?.name ?? rawLevel.name
      : null;
  const levelIcon = levelsEnabled && rawLevel ? rawLevel.icon : null;
  const memberSince = membership
    ? `${String(membership.createdAt.getMonth() + 1).padStart(2, "0")}/${String(
        membership.createdAt.getFullYear(),
      ).slice(-2)}`
    : null;

  const buffer = await generateMembershipPass({
    serialNumber,
    studioName: branding.studioName,
    organizationName: branding.studioName,
    memberName: user?.name ?? "Miembro",
    membershipLabel: activeSub?.package.name ?? "Sin membresía",
    levelName,
    levelIcon,
    memberSince,
    totalClasses: progress?.totalClassesAttended ?? 0,
    avatarUrl: user?.image ?? null,
    qrMessage: `MGIC-MEMBER:${opts.tenantId}:${opts.userId}`,
    webServiceURL: opts.webServiceURL,
    authenticationToken: opts.webServiceURL ? applePassAuthToken(serialNumber) : undefined,
    voided,
    branding: {
      colorAccent: branding.colorAccent,
      colorHeroBg: branding.colorHeroBg,
      colorAccentSoft: branding.colorAccentSoft,
      logoUrl: branding.logoUrl,
      appIconUrl: branding.appIconUrl,
      coachIconSvg: branding.coachIconSvg,
    },
  });

  return { buffer, serialNumber, voided };
}
