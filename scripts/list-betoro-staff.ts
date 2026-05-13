/**
 * List all Betoro staff (COACH + ADMIN memberships) and CoachProfiles so we
 * can decide which to keep before the wipe.
 */
import { prisma } from "../lib/db";

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: "betoro" },
    select: { id: true },
  });

  console.log("── COACH + ADMIN memberships ──");
  const staff = await prisma.membership.findMany({
    where: { tenantId: tenant.id, role: { in: ["COACH", "ADMIN", "FRONT_DESK"] } },
    select: {
      id: true,
      role: true,
      user: { select: { email: true, name: true, isSuperAdmin: true } },
      createdAt: true,
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  for (const m of staff) {
    const su = m.user.isSuperAdmin ? " [SUPER]" : "";
    console.log(
      `  ${m.role.padEnd(11)} | ${(m.user.name ?? "(no name)").padEnd(30)} | ${m.user.email}${su} | mem=${m.id}`,
    );
  }

  console.log("\n── CoachProfiles ──");
  const coaches = await prisma.coachProfile.findMany({
    where: { tenantId: tenant.id },
    select: {
      id: true,
      name: true,
      bio: true,
      userId: true,
      user: { select: { email: true } },
    },
    orderBy: { name: "asc" },
  });
  for (const c of coaches) {
    const linked = c.user ? c.user.email : "(no linked user)";
    console.log(`  ${c.name.padEnd(30)} | ${linked} | id=${c.id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
