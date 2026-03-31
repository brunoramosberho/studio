import { prisma } from "@/lib/db";
import { addDays, setHours, setMinutes, startOfDay } from "date-fns";

function pickTenantId(tenants: { id: string; name: string }[]) {
  const env = process.env.TENANT_ID?.trim();
  if (env) return env;
  if (tenants.length === 1) return tenants[0]!.id;
  return "cmnajumfh0010vbpibp0u2sb5";
}

async function main() {
  console.log("Creating BTM Tone classes (safe add-only)...");
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  const tenantId = pickTenantId(tenants);
  console.log("tenantId:", tenantId);

  const tone = await prisma.classType.findFirst({
    where: { tenantId, name: { contains: "Tone", mode: "insensitive" } },
    select: { id: true, name: true, duration: true },
  });
  if (!tone) throw new Error("BTM Tone class type not found.");
  console.log("classType:", tone.name, tone.id);

  const coach = await prisma.coachProfile.findFirst({
    where: { tenantId },
    select: { id: true },
  });
  if (!coach) throw new Error("No coach profiles found for tenant.");
  console.log("coachProfileId:", coach.id);

  // Prefer a room in Chamberí if it exists.
  const room =
    (await prisma.room.findFirst({
      where: { tenantId, studio: { name: { contains: "Chamber", mode: "insensitive" } } },
      select: { id: true },
    })) ??
    (await prisma.room.findFirst({ where: { tenantId }, select: { id: true } }));

  if (!room) throw new Error("No rooms found for tenant.");
  console.log("roomId:", room.id);

  const now = new Date();
  const alreadyUpcomingTone = await prisma.class.count({
    where: { tenantId, classTypeId: tone.id, status: "SCHEDULED", endsAt: { gt: now } },
  });

  if (alreadyUpcomingTone > 0) {
    console.log(JSON.stringify({ ok: true, message: "BTM Tone already has upcoming classes.", alreadyUpcomingTone }, null, 2));
    return;
  }

  const base = startOfDay(new Date());
  const slots = [
    { dayOffset: 0, h: 18, m: 0 },
    { dayOffset: 1, h: 7, m: 30 },
    { dayOffset: 1, h: 18, m: 0 },
    { dayOffset: 2, h: 7, m: 30 },
    { dayOffset: 2, h: 18, m: 0 },
  ];

  const durationMin = Math.max(15, tone.duration || 50);

  const creates = [];
  for (const s of slots) {
    const startsAt = setMinutes(setHours(addDays(base, s.dayOffset), s.h), s.m);
    if (startsAt <= now) continue;
    const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);

    creates.push(
      prisma.class.create({
        data: {
          tenantId,
          classTypeId: tone.id,
          coachId: coach.id,
          roomId: room.id,
          startsAt,
          endsAt,
          status: "SCHEDULED",
        },
      }),
    );
  }
  const created = (await prisma.$transaction(creates)).length;

  console.log(
    JSON.stringify(
      { ok: true, tenantId, created, classType: tone.name, durationMin },
      null,
      2,
    ),
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

