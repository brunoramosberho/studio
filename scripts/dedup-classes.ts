import { prisma } from "@/lib/db";

/**
 * Find and clean up duplicate Class rows.
 *
 * Duplicate = same (tenantId, roomId, coachId, startsAt) on non-cancelled
 * classes. The Class model has no DB-level uniqueness, so before today's
 * POST-level guard landed, double-submits / network retries could create
 * identical rows.
 *
 * Strategy per duplicate group:
 *   1. Keep the row with the most bookings (so we never destroy attendance).
 *   2. Ties broken by oldest cuid (which is roughly creation order).
 *   3. Skip deleting anything that still has bookings or check-ins.
 *
 * Dry-run by default. Pass --apply to actually delete.
 */

async function main() {
  const apply = process.argv.includes("--apply");

  const rows = await prisma.class.findMany({
    where: { status: { not: "CANCELLED" } },
    select: {
      id: true,
      tenantId: true,
      roomId: true,
      coachId: true,
      classTypeId: true,
      startsAt: true,
      endsAt: true,
      classType: { select: { name: true } },
      coach: { select: { name: true } },
      room: { select: { name: true } },
      _count: {
        select: {
          bookings: true,
          waitlist: true,
          checkIns: true,
          songRequests: true,
          playlistTracks: true,
          ratings: true,
          entitlements: true,
          revenueEvents: true,
          platformBookings: true,
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.tenantId}|${r.roomId}|${r.coachId}|${r.startsAt.toISOString()}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const dupGroups = [...groups.values()].filter((g) => g.length > 1);
  console.log(`\nFound ${dupGroups.length} duplicate group(s).`);

  let plannedDeletes = 0;
  let actualDeletes = 0;

  for (const group of dupGroups) {
    const head = group[0];
    console.log(
      `\n── ${head.startsAt.toISOString()} · ${head.classType.name} · ${head.coach.name} · ${head.room.name} (${group.length} rows)`,
    );

    const sorted = [...group].sort((a, b) => {
      if (b._count.bookings !== a._count.bookings)
        return b._count.bookings - a._count.bookings;
      if (b._count.checkIns !== a._count.checkIns)
        return b._count.checkIns - a._count.checkIns;
      return a.id.localeCompare(b.id);
    });

    const keep = sorted[0];
    const drop = sorted.slice(1);

    console.log(
      `  keep   ${keep.id}  bookings=${keep._count.bookings} checkIns=${keep._count.checkIns}`,
    );
    for (const d of drop) {
      const dirty =
        d._count.bookings +
          d._count.waitlist +
          d._count.checkIns +
          d._count.songRequests +
          d._count.playlistTracks +
          d._count.ratings +
          d._count.entitlements +
          d._count.revenueEvents +
          d._count.platformBookings >
        0;
      if (dirty) {
        console.log(
          `  SKIP   ${d.id}  bookings=${d._count.bookings} waitlist=${d._count.waitlist} checkIns=${d._count.checkIns} — has dependent rows`,
        );
        continue;
      }
      plannedDeletes++;
      if (apply) {
        await prisma.class.delete({ where: { id: d.id } });
        actualDeletes++;
        console.log(`  DELETED ${d.id}`);
      } else {
        console.log(`  would delete ${d.id} (dry-run)`);
      }
    }
  }

  console.log(
    `\nSummary: ${plannedDeletes} class(es) ${apply ? `deleted (${actualDeletes})` : "would be deleted (dry-run, pass --apply to commit)"}.`,
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
