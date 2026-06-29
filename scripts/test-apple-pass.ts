/**
 * Smoke test for the Apple Wallet membership pass.
 * Run: npx tsx --conditions=react-server scripts/test-apple-pass.ts [tenantSlug]
 *
 * Loads .env.local (cert material), pulls real branding + a member with an
 * active subscription, generates the signed .pkpass and writes it to
 * ~/magic-pass/test-membership.pkpass for inspection / opening in Wallet.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { homedir } = await import("node:os");
  const { generateMembershipPass, isApplePassConfigured } = await import("../lib/wallet/apple-pass");
  const { tenantToBranding } = await import("../lib/branding");

  console.log("isApplePassConfigured:", isApplePassConfigured());
  if (!isApplePassConfigured()) {
    throw new Error("APPLE_PASS_* env vars missing — check .env.local");
  }

  const prisma = new PrismaClient();
  const slug = process.argv[2] || "betoro";

  const tenant = await prisma.tenant.findFirst({ where: { slug } });
  if (!tenant) throw new Error(`tenant '${slug}' not found in this DB`);
  const branding = tenantToBranding(tenant);

  const activeSub = await prisma.userPackage.findFirst({
    where: { tenantId: tenant.id, expiresAt: { gt: new Date() }, package: { type: "SUBSCRIPTION" }, user: { image: { not: null } } },
    include: { package: { select: { name: true } }, user: { select: { id: true, name: true, image: true } } },
    orderBy: { expiresAt: "desc" },
  });

  const member =
    activeSub?.user ??
    (await prisma.user.findFirst({
      where: { memberships: { some: { tenantId: tenant.id } } },
      select: { id: true, name: true, image: true },
    }));

  let levelName: string | null = null;
  let levelIcon: string | null = null;
  let memberSince: string | null = null;
  let totalClasses = 0;
  if (member) {
    const progress = await prisma.memberProgress.findUnique({
      where: { userId_tenantId: { userId: member.id, tenantId: tenant.id } },
      include: { currentLevel: true },
    });
    const gamConfig = await prisma.tenantGamificationConfig.findUnique({
      where: { tenantId: tenant.id },
    });
    const levelOverrides = (gamConfig?.levelOverrides ?? {}) as Record<string, { name?: string }>;
    const rawLevel = progress?.currentLevel ?? null;
    levelName = rawLevel ? levelOverrides[String(rawLevel.sortOrder)]?.name ?? rawLevel.name : null;
    levelIcon = rawLevel?.icon ?? null;
    totalClasses = progress?.totalClassesAttended ?? 0;
    const m = await prisma.membership.findFirst({
      where: { userId: member.id, tenantId: tenant.id },
      select: { createdAt: true },
    });
    if (m) {
      memberSince = `${String(m.createdAt.getMonth() + 1).padStart(2, "0")}/${String(
        m.createdAt.getFullYear(),
      ).slice(-2)}`;
    }
  }

  const membershipLabel = activeSub?.package.name ?? "Membresía Ilimitada";

  console.log("Generating pass with:", {
    studio: branding.studioName,
    member: member?.name ?? "(none)",
    membershipLabel,
    level: levelName,
    logoUrl: branding.logoUrl,
    appIconUrl: branding.appIconUrl,
    accent: branding.colorAccent,
    hero: branding.colorHeroBg,
    hadActiveSub: !!activeSub,
  });

  const buffer = await generateMembershipPass({
    serialNumber: `${slug}.${member?.id ?? "test"}`,
    studioName: branding.studioName,
    organizationName: branding.studioName,
    memberName: process.argv[3] ?? member?.name ?? "Bruno Ramos",
    membershipLabel,
    levelName,
    levelIcon,
    memberSince,
    totalClasses,
    avatarUrl: member?.image ?? null,
    qrMessage: `MGIC-MEMBER:${tenant.id}:${member?.id ?? "test"}`,
    branding: {
      colorAccent: branding.colorAccent,
      colorHeroBg: branding.colorHeroBg,
      colorAccentSoft: branding.colorAccentSoft,
      logoUrl: branding.logoUrl,
      appIconUrl: branding.appIconUrl,
      coachIconSvg: branding.coachIconSvg,
    },
  });

  const out = join(homedir(), "magic-pass", "test-membership.pkpass");
  writeFileSync(out, buffer);
  console.log(`\n✅ WROTE ${out} (${buffer.length} bytes)`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
