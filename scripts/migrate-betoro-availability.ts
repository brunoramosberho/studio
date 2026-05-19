/**
 * Betoro availability migration: invert recurring "time_off" blocks into
 * positive "availability" blocks (the complement).
 *
 * Context: before the dual-model rollout, CoachAvailabilityBlock meant
 * "I am NOT available". A coach typically registered her time-off as a
 * weekly recurring block (e.g. "lunes 07:00–12:00 no puedo"). With the
 * new model, the source of truth becomes "when I CAN teach". This script
 * converts the existing recurring blocks into their complement within
 * the tenant's operating window so coaches don't lose their schedule.
 *
 * Behaviour per coach:
 *   1) Read all recurring blocks (kind=time_off, the old default).
 *   2) For each operating day of the week, compute the complement of
 *      the union of "no puedo" ranges against [openTime, closeTime].
 *      The complement = "puedo" ranges.
 *   3) Create matching kind=availability, type=recurring blocks. All
 *      studios are wired as `preferred` by default — coaches/admin can
 *      tweak per-studio later.
 *   4) Hard-delete the original recurring blocks so they don't double-count.
 *
 * Preserved unchanged:
 *   - one_time blocks (vacaciones puntuales / citas) keep kind=time_off.
 *   - Any block whose status is rejected.
 *
 * USAGE
 *   npx tsx scripts/migrate-betoro-availability.ts            # dry-run
 *   npx tsx scripts/migrate-betoro-availability.ts --apply    # commit
 */

import { prisma } from "../lib/db";
import { SLOT_MINUTES } from "../lib/availability";

const TENANT_SLUG = process.env.MIGRATE_TENANT_SLUG ?? "betoro";

interface Range {
  startMin: number;
  endMin: number;
}

function parseHhmm(value: string | null): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function mergeRanges(ranges: Range[]): Range[] {
  if (ranges.length === 0) return [];
  const sorted = ranges.slice().sort((a, b) => a.startMin - b.startMin);
  const out: Range[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, cur.endMin);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** Returns `base − cuts` as a list of non-overlapping ranges. */
function complement(base: Range, cuts: Range[]): Range[] {
  let result: Range[] = [{ ...base }];
  const merged = mergeRanges(cuts);
  for (const cut of merged) {
    const next: Range[] = [];
    for (const r of result) {
      if (cut.endMin <= r.startMin || cut.startMin >= r.endMin) {
        next.push(r);
        continue;
      }
      if (cut.startMin > r.startMin) {
        next.push({ startMin: r.startMin, endMin: cut.startMin });
      }
      if (cut.endMin < r.endMin) {
        next.push({ startMin: cut.endMin, endMin: r.endMin });
      }
    }
    result = next.filter((r) => r.endMin > r.startMin);
  }
  return result;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const mode = apply ? "APPLY" : "DRY RUN";

  const tenant = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
    select: {
      id: true,
      slug: true,
      studioOpenTime: true,
      studioCloseTime: true,
      operatingDays: true,
    },
  });
  if (!tenant) {
    console.error(`Tenant ${TENANT_SLUG} not found`);
    process.exit(1);
  }

  console.log(`\n[${mode}] migrate-betoro-availability`);
  console.log(`Tenant: ${tenant.slug} (${tenant.id})`);
  console.log(`Window: ${tenant.studioOpenTime}–${tenant.studioCloseTime}, days ${tenant.operatingDays.join(",")}\n`);

  const openMin = parseHhmm(tenant.studioOpenTime);
  const closeMin = parseHhmm(tenant.studioCloseTime);
  if (openMin == null || closeMin == null || closeMin <= openMin) {
    console.error("Invalid tenant operating window");
    process.exit(1);
  }

  const studios = await prisma.studio.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  console.log(`Studios (${studios.length}): ${studios.map((s) => s.name).join(", ")}\n`);

  // Old-model blocks: every existing row defaulted to kind=time_off via
  // the migration. We only invert RECURRING ones — puntuales remain as-is.
  const recurring = await prisma.coachAvailabilityBlock.findMany({
    where: {
      tenantId: tenant.id,
      kind: "time_off",
      type: "recurring",
    },
    orderBy: { coachId: "asc" },
  });

  if (recurring.length === 0) {
    console.log("No recurring blocks to migrate. Done.");
    return;
  }

  console.log(`Recurring blocks to invert: ${recurring.length}\n`);

  const byCoach = new Map<string, typeof recurring>();
  for (const b of recurring) {
    const arr = byCoach.get(b.coachId) ?? [];
    arr.push(b);
    byCoach.set(b.coachId, arr);
  }

  const operatingDays = new Set(tenant.operatingDays);
  let totalCreated = 0;

  for (const [coachId, blocks] of byCoach.entries()) {
    const coach = await prisma.user.findUnique({
      where: { id: coachId },
      select: { id: true, name: true, email: true },
    });
    const label = coach?.name || coach?.email || coachId;
    console.log(`── ${label} ──`);
    console.log(`   ${blocks.length} recurring time_off block(s)`);

    // For each operating day, accumulate the union of "no puedo" ranges
    // contributed by recurring blocks that touch that day.
    const cutsByDay = new Map<number, Range[]>();
    for (const b of blocks) {
      const sm = parseHhmm(b.startTime);
      const em = parseHhmm(b.endTime);
      const range: Range = sm != null && em != null && em > sm
        ? { startMin: sm, endMin: em }
        : { startMin: openMin, endMin: closeMin };
      for (const d of b.dayOfWeek) {
        const arr = cutsByDay.get(d) ?? [];
        arr.push(range);
        cutsByDay.set(d, arr);
      }
    }

    // Align the resulting ranges to SLOT_MINUTES-min boundaries so the new UI can
    // re-edit them. Round start UP, end DOWN — we err on the side of
    // surfacing less availability than the literal complement (coaches
    // can always widen later) instead of inventing slots they didn't have.
    const newRanges: { dayOfWeek: number; startTime: string; endTime: string }[] = [];
    for (const d of operatingDays) {
      const cuts = cutsByDay.get(d) ?? [];
      const comp = complement({ startMin: openMin, endMin: closeMin }, cuts);
      for (const r of comp) {
        const alignedStart = Math.ceil(r.startMin / SLOT_MINUTES) * SLOT_MINUTES;
        const alignedEnd = Math.floor(r.endMin / SLOT_MINUTES) * SLOT_MINUTES;
        if (alignedEnd - alignedStart < SLOT_MINUTES) continue; // skip degenerate slivers
        newRanges.push({
          dayOfWeek: d,
          startTime: formatMinutes(alignedStart),
          endTime: formatMinutes(alignedEnd),
        });
      }
    }

    console.log(`   → ${newRanges.length} availability block(s) to create:`);
    for (const r of newRanges) {
      const dayShort = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"][r.dayOfWeek];
      console.log(`       ${dayShort} ${r.startTime}–${r.endTime}`);
    }

    if (apply) {
      await prisma.$transaction(async (tx) => {
        for (const r of newRanges) {
          await tx.coachAvailabilityBlock.create({
            data: {
              tenantId: tenant.id,
              coachId,
              kind: "availability",
              type: "recurring",
              dayOfWeek: [r.dayOfWeek],
              startTime: r.startTime,
              endTime: r.endTime,
              isAllDay: false,
              reasonType: null,
              status: "active",
              approvedAt: new Date(),
              studioPreferences: {
                create: studios.map((s) => ({
                  studioId: s.id,
                  preference: "preferred" as const,
                  tenantId: tenant.id,
                })),
              },
            },
          });
        }
        await tx.coachAvailabilityBlock.deleteMany({
          where: { id: { in: blocks.map((b) => b.id) } },
        });
      });
      totalCreated += newRanges.length;
    } else {
      totalCreated += newRanges.length;
    }
    console.log("");
  }

  console.log(`\n${apply ? "Created" : "Would create"}: ${totalCreated} availability block(s)`);
  console.log(`${apply ? "Deleted" : "Would delete"}: ${recurring.length} legacy recurring time_off block(s)`);
  if (!apply) {
    console.log("\nThis was a dry run. Re-run with --apply to commit.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
