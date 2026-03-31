import { prisma } from "@/lib/db";

const TARGETS = [
  { key: "method", name: "Be Toro Method (BTM)" },
  { key: "tone", name: "Be Toro Tone (BTM Tone)" },
  { key: "flow", name: "Be Toro Flow (BTM Flow)" },
] as const;

function pickTenantId(tenants: { id: string; name: string }[]) {
  const env = process.env.TENANT_ID?.trim();
  if (env) return env;
  if (tenants.length === 1) return tenants[0]!.id;
  return null;
}

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function guessTargetKey(classTypeName: string): (typeof TARGETS)[number]["key"] {
  const n = norm(classTypeName);

  // Explicit BTM variants first
  if (n.includes("btm tone") || n.includes("be toro tone") || n.includes("tone")) return "tone";
  if (n.includes("btm flow") || n.includes("be toro flow") || n.includes("flow")) return "flow";

  // Common non-BTM disciplines → closest match
  if (/(yoga|stretch|movilidad|mobility|mindful|relax|restorative|breath|respir)/.test(n)) return "flow";
  if (/(tone|tonifica|sculpt|pilates sculpt|fuerza|strength|weights|pesas|muscle|definition)/.test(n)) return "tone";

  return "method";
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

  const all = await prisma.classType.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });

  const byKey = new Map<(typeof TARGETS)[number]["key"], { id: string; name: string }>();
  for (const t of TARGETS) {
    const found =
      all.find((ct) => norm(ct.name) === norm(t.name)) ??
      all.find((ct) => norm(ct.name).includes(`btm ${t.key}`)) ??
      all.find((ct) => norm(ct.name).includes(`be toro ${t.key}`));
    if (!found) {
      throw new Error(`Missing target ClassType for "${t.name}". Create it first.`);
    }
    byKey.set(t.key, found);
  }

  const targetIds = new Set(Array.from(byKey.values()).map((t) => t.id));
  const extras = all.filter((ct) => !targetIds.has(ct.id));

  let movedClasses = 0;
  let touchedRooms = 0;
  let touchedPackages = 0;
  let deleted = 0;

  for (const extra of extras) {
    const targetKey = guessTargetKey(extra.name);
    const target = byKey.get(targetKey)!;

    // Move classes
    const classRes = await prisma.class.updateMany({
      where: { tenantId, classTypeId: extra.id },
      data: { classTypeId: target.id },
    });
    movedClasses += classRes.count;

    // Move rooms m2m links
    const rooms = await prisma.room.findMany({
      where: { tenantId, classTypes: { some: { id: extra.id } } },
      select: { id: true },
    });
    for (const r of rooms) {
      await prisma.room.update({
        where: { id: r.id },
        data: {
          classTypes: {
            disconnect: { id: extra.id },
            connect: { id: target.id },
          },
        },
      });
      touchedRooms += 1;
    }

    // Move packages m2m links
    const packages = await prisma.package.findMany({
      where: { tenantId, classTypes: { some: { id: extra.id } } },
      select: { id: true },
    });
    for (const p of packages) {
      await prisma.package.update({
        where: { id: p.id },
        data: {
          classTypes: {
            disconnect: { id: extra.id },
            connect: { id: target.id },
          },
        },
      });
      touchedPackages += 1;
    }

    // Delete extra class type (now that references are moved)
    await prisma.classType.delete({ where: { id: extra.id, tenantId } });
    deleted += 1;
  }

  const remaining = await prisma.classType.findMany({
    where: { tenantId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  console.log(
    JSON.stringify(
      {
        tenantId,
        targets: Object.fromEntries(Array.from(byKey.entries()).map(([k, v]) => [k, v])),
        movedClasses,
        touchedRooms,
        touchedPackages,
        deletedExtraClassTypes: deleted,
        remainingClassTypes: remaining.map((c) => c.name),
      },
      null,
      2,
    ),
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

