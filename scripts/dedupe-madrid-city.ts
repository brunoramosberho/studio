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

  const spain = await prisma.country.findUnique({ where: { code: "ES" }, select: { id: true } });
  if (!spain) throw new Error("Spain (ES) not found.");

  const madrids = await prisma.city.findMany({
    where: { countryId: spain.id, name: { equals: "Madrid", mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      _count: { select: { studios: true, users: true } },
    },
    orderBy: { id: "asc" },
  });

  if (madrids.length <= 1) {
    console.log(JSON.stringify({ ok: true, message: "No duplicate Madrid found.", madrids }, null, 2));
    return;
  }

  // Keep the one with most studios, then most users.
  const sorted = madrids
    .slice()
    .sort((a, b) => (b._count.studios - a._count.studios) || (b._count.users - a._count.users) || a.id.localeCompare(b.id));
  const keep = sorted[0]!;
  const drop = sorted.slice(1);

  let movedStudios = 0;
  let movedUsers = 0;
  let deleted = 0;

  for (const d of drop) {
    const sRes = await prisma.studio.updateMany({
      where: { tenantId, cityId: d.id },
      data: { cityId: keep.id },
    });
    movedStudios += sRes.count;

    const uRes = await prisma.user.updateMany({
      where: { cityId: d.id },
      data: { cityId: keep.id },
    });
    movedUsers += uRes.count;

    await prisma.city.delete({ where: { id: d.id } });
    deleted += 1;
  }

  const remaining = await prisma.city.findMany({
    where: { countryId: spain.id, name: { equals: "Madrid", mode: "insensitive" } },
    select: { id: true, _count: { select: { studios: true, users: true } } },
  });

  console.log(
    JSON.stringify(
      {
        tenantId,
        keep,
        dropped: drop,
        movedStudios,
        movedUsers,
        deleted,
        remaining,
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

