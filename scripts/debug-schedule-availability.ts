import { prisma } from "@/lib/db";

function pickTenantId(tenants: { id: string; name: string }[]) {
  const env = process.env.TENANT_ID?.trim();
  if (env) return env;
  if (tenants.length === 1) return tenants[0]!.id;
  return "cmnajumfh0010vbpibp0u2sb5";
}

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  const tenantId = pickTenantId(tenants);
  const now = new Date();

  const cities = await prisma.city.findMany({
    where: { studios: { some: { tenantId } } },
    select: { id: true, name: true, country: { select: { code: true, name: true } } },
    orderBy: { name: "asc" },
  });

  const studios = await prisma.studio.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      address: true,
      cityId: true,
      city: { select: { name: true, country: { select: { code: true } } } },
    },
    orderBy: { name: "asc" },
  });

  const upcoming = await prisma.class.findMany({
    where: { tenantId, status: "SCHEDULED", endsAt: { gt: now } },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      classType: { select: { name: true } },
      room: { select: { name: true, studio: { select: { name: true, cityId: true } } } },
    },
    orderBy: { startsAt: "asc" },
    take: 20,
  });

  const counts = await prisma.class.groupBy({
    by: ["status"],
    where: { tenantId },
    _count: { _all: true },
  });

  console.log(
    JSON.stringify(
      {
        tenantId,
        cities,
        studios,
        classCountsByStatus: counts,
        upcomingSample: upcoming.map((c) => ({
          startsAt: c.startsAt,
          classType: c.classType.name,
          studio: c.room.studio.name,
          studioCityId: c.room.studio.cityId,
          room: c.room.name,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

