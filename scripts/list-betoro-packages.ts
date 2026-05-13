import { prisma } from "../lib/db";
async function main() {
  const tid = (await prisma.tenant.findUniqueOrThrow({ where: { slug: "betoro" }, select: { id: true } })).id;
  const pkgs = await prisma.package.findMany({
    where: { tenantId: tid },
    select: { id: true, name: true, type: true, price: true, currency: true, recurringInterval: true, stripePriceId: true, isActive: true, credits: true },
    orderBy: { sortOrder: "asc" },
  });
  for (const p of pkgs) {
    console.log(`${p.type.padEnd(13)} | ${p.name.padEnd(30)} | ${p.price} ${p.currency} ${p.recurringInterval ?? ""} | credits=${p.credits ?? "—"} | active=${p.isActive} | stripePriceId=${p.stripePriceId ?? "(null)"}`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
