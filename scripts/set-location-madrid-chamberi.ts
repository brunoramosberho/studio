import { prisma } from "@/lib/db";

function pickTenantId(tenants: { id: string; name: string }[]) {
  const env = process.env.TENANT_ID?.trim();
  if (env) return env;
  if (tenants.length === 1) return tenants[0]!.id;
  return null;
}

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  const tenantId = pickTenantId(tenants);
  if (!tenantId) {
    throw new Error(
      `Multiple tenants found. Re-run with TENANT_ID=<id>. Tenants: ${tenants
        .map((t) => `${t.name}:${t.id}`)
        .join(", ")}`,
    );
  }

  // Ensure Spain exists (countries list is fixed + inserted via /api/locations,
  // but we don't assume /api/locations was hit).
  const spain = await prisma.country.upsert({
    where: { code: "ES" },
    update: {},
    create: { code: "ES", name: "España" },
    select: { id: true },
  });

  // Ensure Madrid city exists
  const madrid = await prisma.city.upsert({
    where: {
      // No unique constraint on (countryId, name), so do a find-first then create if missing.
      // This keeps it safe and non-destructive.
      id: "___dummy___",
    },
    update: {},
    create: { countryId: spain.id, name: "Madrid", timezone: "Europe/Madrid" },
  }).catch(async () => {
    const existing = await prisma.city.findFirst({
      where: { countryId: spain.id, name: { equals: "Madrid", mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      await prisma.city.update({
        where: { id: existing.id },
        data: { timezone: "Europe/Madrid" },
      });
      return existing as any;
    }
    const created = await prisma.city.create({
      data: { countryId: spain.id, name: "Madrid", timezone: "Europe/Madrid" },
      select: { id: true },
    });
    return created as any;
  });

  // Move all studios for tenant to Madrid
  const studios = await prisma.studio.findMany({
    where: { tenantId },
    select: { id: true, name: true, address: true, cityId: true },
  });

  let movedStudios = 0;
  let updatedAddresses = 0;
  for (const s of studios) {
    if (s.cityId !== madrid.id) {
      await prisma.studio.update({
        where: { id: s.id, tenantId },
        data: { cityId: madrid.id },
      });
      movedStudios += 1;
    }
    if (!s.address || !s.address.trim()) {
      await prisma.studio.update({
        where: { id: s.id, tenantId },
        data: { address: "Chamberí" },
      });
      updatedAddresses += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        tenantId,
        country: "ES",
        city: "Madrid",
        movedStudios,
        updatedAddresses,
        totalStudios: studios.length,
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

