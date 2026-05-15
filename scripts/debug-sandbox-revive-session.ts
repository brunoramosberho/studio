/**
 * Diagnostic: why does brunoramosberho@gmail.com get prompted to log in
 * every time on sandbox-revive.mgic.app?
 */
import { prisma } from "../lib/db";

async function main() {
  const EMAIL = "brunoramosberho@gmail.com";
  const SLUG = "sandbox-revive";

  const [tenant, user] = await Promise.all([
    prisma.tenant.findUnique({
      where: { slug: SLUG },
      select: {
        id: true,
        slug: true,
        name: true,
        isActive: true,
        subscriptionStatus: true,
        defaultCountryId: true,
      },
    }),
    prisma.user.findUnique({
      where: { email: EMAIL },
      select: {
        id: true,
        email: true,
        name: true,
        isSuperAdmin: true,
        emailVerified: true,
      },
    }),
  ]);

  console.log("Tenant:", tenant);
  console.log("User:", user);
  if (!tenant || !user) return;

  const [membership, coachProfile, sessions, accounts] = await Promise.all([
    prisma.membership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      select: {
        role: true,
        lifecycleStage: true,
        lastSeenAt: true,
        createdAt: true,
        pwaInstalledAt: true,
      },
    }),
    prisma.coachProfile.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      select: { id: true, name: true },
    }),
    prisma.session.findMany({
      where: { userId: user.id },
      orderBy: { expires: "desc" },
      select: { id: true, sessionToken: true, expires: true },
      take: 10,
    }),
    prisma.account.findMany({
      where: { userId: user.id },
      select: { provider: true, providerAccountId: true },
    }),
  ]);

  console.log("Membership:", membership);
  console.log("CoachProfile:", coachProfile);
  console.log(
    "Sessions (recent):",
    sessions.map((s) => ({
      id: s.id,
      tokenPrefix: s.sessionToken.slice(0, 8) + "...",
      expires: s.expires,
      expired: s.expires < new Date(),
    })),
  );
  console.log("Accounts:", accounts);

  // Count all memberships for this user — maybe they exist on other tenants
  const allMemberships = await prisma.membership.findMany({
    where: { userId: user.id },
    select: {
      role: true,
      pwaInstalledAt: true,
      tenant: { select: { slug: true, name: true, isActive: true } },
    },
  });
  console.log("\nAll memberships for this user:");
  for (const m of allMemberships) {
    console.log(
      `  ${m.tenant.slug} (${m.tenant.name}) — ${m.role}, active=${m.tenant.isActive}, pwa=${m.pwaInstalledAt ?? "never"}`,
    );
  }

  // Look at tenant's full config to see if anything is unusual
  const fullTenant = await prisma.tenant.findUnique({
    where: { slug: SLUG },
    select: {
      slug: true,
      locale: true,
      operatingDays: true,
      studioOpenTime: true,
      studioCloseTime: true,
      stripeAccountId: true,
      stripeSubscriptionId: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      defaultCountry: { select: { code: true, currency: true } },
    },
  });
  console.log("\nFull tenant config (relevant):", fullTenant);

  // Push subscriptions per tenant — sanity check
  const pushSubs = await prisma.pushSubscription.findMany({
    where: { userId: user.id },
    select: {
      tenantId: true,
      tenant: { select: { slug: true } },
      createdAt: true,
    },
  });
  console.log("\nPush subscriptions:");
  for (const p of pushSubs) {
    console.log(`  ${p.tenant.slug} — created ${p.createdAt.toISOString()}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
