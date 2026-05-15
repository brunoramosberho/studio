import { prisma } from "@/lib/db";

export async function buildPlannerContext(tenantId: string) {
  const [studios, classTypes, coachProfiles, recentClasses] = await Promise.all([
    prisma.studio.findMany({
      where: { tenantId },
      include: {
        rooms: { select: { id: true, name: true, maxCapacity: true } },
      },
    }),
    prisma.classType.findMany({
      where: { tenantId },
      select: { id: true, name: true, duration: true },
    }),
    prisma.coachProfile.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    }),
    prisma.class.findMany({
      where: {
        tenantId,
        startsAt: { gte: daysAgo(28) },
        status: { not: "CANCELLED" },
      },
      select: { coachId: true, classTypeId: true },
    }),
  ]);

  const coachDisciplines = new Map<string, Set<string>>();
  for (const cl of recentClasses) {
    const existing = coachDisciplines.get(cl.coachId) ?? new Set<string>();
    existing.add(cl.classTypeId);
    coachDisciplines.set(cl.coachId, existing);
  }
  const classTypeNameById = new Map<string, string>(
    classTypes.map((c) => [c.id, c.name] as const),
  );

  return {
    studios: studios.map((s) => ({
      id: s.id,
      name: s.name,
      rooms: s.rooms,
    })),
    classTypes,
    coaches: coachProfiles.map((c) => ({
      id: c.id,
      name: c.name,
      disciplines: Array.from(coachDisciplines.get(c.id) ?? new Set<string>()).map(
        (id) => classTypeNameById.get(id) ?? id,
      ),
    })),
  };
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}
