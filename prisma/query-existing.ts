import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, name: true },
  });
  console.log("\n=== TENANTS ===");
  for (const t of tenants) console.log(`  ${t.slug} → id: ${t.id} (${t.name})`);

  for (const tenant of tenants) {
    console.log(`\n=== TENANT: ${tenant.slug} ===`);

    const classTypes = await prisma.classType.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true, duration: true, color: true },
    });
    console.log("\n  ClassTypes:");
    for (const ct of classTypes)
      console.log(`    "${ct.name}" → id: ${ct.id}, duration: ${ct.duration}, color: ${ct.color}`);

    const coaches = await prisma.coachProfile.findMany({
      where: { tenantId: tenant.id },
      include: { user: { select: { name: true, email: true } } },
    });
    console.log("\n  CoachProfiles:");
    for (const c of coaches)
      console.log(`    "${c.user.name}" (${c.user.email}) → id: ${c.id}`);

    const rooms = await prisma.room.findMany({
      where: { tenantId: tenant.id },
      include: { studio: { select: { name: true, address: true } } },
    });
    console.log("\n  Rooms:");
    for (const r of rooms)
      console.log(`    "${r.name}" @ ${r.studio.name} → id: ${r.id}, cap: ${r.maxCapacity}`);

    const futureClasses = await prisma.class.count({
      where: { tenantId: tenant.id, startsAt: { gte: new Date() } },
    });
    const pastClasses = await prisma.class.count({
      where: { tenantId: tenant.id, startsAt: { lt: new Date() } },
    });
    console.log(`\n  Classes: ${pastClasses} past, ${futureClasses} future`);

    const studios = await prisma.studio.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true, address: true },
    });
    console.log("\n  Studios:");
    for (const s of studios)
      console.log(`    "${s.name}" (${s.address}) → id: ${s.id}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
