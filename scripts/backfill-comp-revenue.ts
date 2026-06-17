/**
 * Correct historical revenue recognition for COMP packages (gifts, 100%-off
 * free packs, sandbox sims, not-yet-paid placeholders).
 *
 * These were accounted at catalog list price (entitlement.totalAmountCents =
 * package.price) and emitted booking/breakage RevenueEvents at that price,
 * inflating /admin/finance/recognition with non-cash "revenue". Under ASC 606
 * their transaction price is 0, so this resets:
 *   - entitlement.totalAmountCents -> 0
 *   - every linked RevenueEvent.amountCents -> 0
 * for entitlements whose UserPackage.stripePaymentId is a comp marker.
 *
 * Usage:
 *   npx tsx scripts/backfill-comp-revenue.ts                 # all tenants, DRY RUN
 *   npx tsx scripts/backfill-comp-revenue.ts <slug>          # one tenant, DRY RUN
 *   npx tsx scripts/backfill-comp-revenue.ts <slug> --apply  # actually write
 *
 * Idempotent: rows already at 0 are skipped.
 */
import { PrismaClient } from "@prisma/client";
import { isCompPackage } from "@/lib/revenue/entitlements";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const slug = args.find((a) => !a.startsWith("--"));

  const tenants = await prisma.tenant.findMany({
    where: slug ? { slug } : {},
    select: { id: true, slug: true, name: true },
  });
  if (tenants.length === 0) {
    console.error("No tenants found");
    process.exit(1);
  }

  console.log(apply ? "MODE: APPLY (writing changes)\n" : "MODE: DRY RUN (no writes)\n");

  for (const tenant of tenants) {
    // All entitlements tied to a UserPackage for this tenant.
    const ents = await prisma.entitlement.findMany({
      where: { tenantId: tenant.id, userPackageId: { not: null } },
      select: { id: true, userPackageId: true, totalAmountCents: true },
    });
    if (ents.length === 0) continue;

    const upIds = [...new Set(ents.map((e) => e.userPackageId!).filter(Boolean))];
    const ups = await prisma.userPackage.findMany({
      where: { id: { in: upIds } },
      select: { id: true, stripePaymentId: true },
    });
    const compUpIds = new Set(
      ups.filter((u) => isCompPackage(u.stripePaymentId)).map((u) => u.id),
    );

    const compEnts = ents.filter((e) => compUpIds.has(e.userPackageId!));
    if (compEnts.length === 0) continue;

    const compEntIds = compEnts.map((e) => e.id);

    // Revenue events to zero out (any type linked to a comp entitlement).
    const events = await prisma.revenueEvent.findMany({
      where: { entitlementId: { in: compEntIds }, amountCents: { not: 0 } },
      select: { id: true, type: true, amountCents: true },
    });
    const eventSum = events.reduce((s, e) => s + e.amountCents, 0);
    const entToZero = compEnts.filter((e) => e.totalAmountCents !== 0);

    console.log(`— ${tenant.name} (${tenant.slug}) —`);
    console.log(`  comp entitlements: ${compEnts.length} (${entToZero.length} with non-zero amount)`);
    console.log(`  RevenueEvents to zero: ${events.length}  totaling ${(eventSum / 100).toFixed(2)}`);

    if (!apply) {
      console.log("  (dry run — nothing written)\n");
      continue;
    }

    await prisma.$transaction([
      prisma.revenueEvent.updateMany({
        where: { entitlementId: { in: compEntIds }, amountCents: { not: 0 } },
        data: { amountCents: 0 },
      }),
      prisma.entitlement.updateMany({
        where: { id: { in: compEntIds }, totalAmountCents: { not: 0 } },
        data: { totalAmountCents: 0 },
      }),
    ]);
    console.log(`  ✓ zeroed ${events.length} events + ${entToZero.length} entitlements\n`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
