import type { PrismaClient } from "@prisma/client";

/** Overwrites class discipline fields on feed payloads from current ClassType (names can change after the event was stored). */
export async function enrichPayloadsWithCurrentClassType(
  db: PrismaClient,
  payloads: Array<Record<string, unknown> | null | undefined>,
): Promise<void> {
  const ids = new Set<string>();
  for (const p of payloads) {
    const id = p?.classId;
    if (typeof id === "string" && id) ids.add(id);
  }
  if (ids.size === 0) return;

  const rows = await db.class.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      classType: {
        select: {
          id: true,
          name: true,
          color: true,
          icon: true,
          mediaUrl: true,
          tags: true,
          description: true,
          duration: true,
          level: true,
        },
      },
    },
  });

  const map = new Map(rows.map((r) => [r.id, r.classType]));

  for (const payload of payloads) {
    if (!payload) continue;
    const classId = payload.classId;
    if (typeof classId !== "string") continue;
    const ct = map.get(classId);
    if (!ct) continue;
    payload.className = ct.name;
    payload.classTypeId = ct.id;
    payload.classTypeColor = ct.color;
    payload.classTypeIcon = ct.icon;
    payload.classTypeMediaUrl = ct.mediaUrl;
    payload.classTypeTags = ct.tags;
    payload.classTypeDescription = ct.description;
    payload.classTypeDuration = ct.duration;
    payload.classTypeLevel = ct.level;
  }
}
