/**
 * BE TORO opening weekend: pay every instructor a flat €25/class on Fri 26 –
 * Sun 28 Jun 2026 (regardless of attendance), then the headcount tier rate from
 * Mon 29 Jun onward.
 *
 *   npx tsx scripts/apply-betoro-opening-weekend-rate.ts          # dry run
 *   npx tsx scripts/apply-betoro-opening-weekend-rate.ts --apply  # write
 *
 * Requires the per-class effective-window fix in the pay calc (a rate now only
 * applies to classes within [effectiveFrom, effectiveTo]).
 * Idempotent: skips creating the flat rate if it already exists for the coach.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Madrid is UTC+2 in June (CEST), so local midnights are 22:00 UTC the prior day.
const WEEKEND_FROM = new Date("2026-06-25T22:00:00.000Z"); // Fri 26 Jun 00:00 Madrid
const WEEKEND_TO = new Date("2026-06-28T22:00:00.000Z"); // Mon 29 Jun 00:00 Madrid
const FLAT_AMOUNT = 25;

async function main() {
  const apply = process.argv.includes("--apply");
  const tenant = await prisma.tenant.findFirst({ where: { slug: "betoro" }, select: { id: true } });
  if (!tenant) throw new Error("betoro not found");

  const coaches = await prisma.coachProfile.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  console.log(apply ? "MODE: APPLY\n" : "MODE: DRY RUN (use --apply)\n");
  console.log(`Coaches: ${coaches.length}`);
  console.log(`Flat €${FLAT_AMOUNT}/class: ${WEEKEND_FROM.toISOString()} → ${WEEKEND_TO.toISOString()} (Fri 26–Sun 28 Jun, Madrid)`);
  console.log(`Tier rates: effectiveFrom moved to ${WEEKEND_TO.toISOString()} (Mon 29 Jun)\n`);

  let created = 0, movedTiers = 0, skipped = 0;
  for (const c of coaches) {
    // 1) Move this coach's active OCCUPANCY_TIER rate(s) to start Monday.
    const tierRes = await prisma.coachPayRate.findMany({
      where: { coachProfileId: c.id, tenantId: tenant.id, type: "OCCUPANCY_TIER", isActive: true },
      select: { id: true },
    });
    // 2) Flat opening-weekend rate — skip if it already exists.
    const existingFlat = await prisma.coachPayRate.findFirst({
      where: {
        coachProfileId: c.id, tenantId: tenant.id, type: "PER_CLASS",
        amount: FLAT_AMOUNT, effectiveFrom: WEEKEND_FROM, isActive: true,
      },
      select: { id: true },
    });

    if (!apply) {
      console.log(`  ${c.name}: move ${tierRes.length} tier rate(s) → Mon; ${existingFlat ? "flat exists (skip)" : "create €25 flat"}`);
      continue;
    }

    if (tierRes.length) {
      await prisma.coachPayRate.updateMany({
        where: { id: { in: tierRes.map((r) => r.id) } },
        data: { effectiveFrom: WEEKEND_TO },
      });
      movedTiers += tierRes.length;
    }

    if (existingFlat) {
      skipped++;
    } else {
      await prisma.coachPayRate.create({
        data: {
          coachProfileId: c.id,
          tenantId: tenant.id,
          type: "PER_CLASS",
          amount: FLAT_AMOUNT,
          currency: "EUR",
          effectiveFrom: WEEKEND_FROM,
          effectiveTo: WEEKEND_TO,
          isActive: true,
          notes: "Apertura: tarifa plana fin de semana (Vie 26 – Dom 28 jun)",
        },
      });
      created++;
    }
    console.log(`  ✓ ${c.name}`);
  }

  if (apply) console.log(`\nDone: ${created} flat rates created, ${movedTiers} tier rates moved to Mon, ${skipped} skipped.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
