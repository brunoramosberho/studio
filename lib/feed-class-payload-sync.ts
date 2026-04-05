import type { PrismaClient } from "@prisma/client";

/** Overwrites class discipline + coach fields on feed payloads from current DB state. */
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
      coach: {
        select: {
          userId: true,
          photoUrl: true,
          user: { select: { name: true, image: true } },
        },
      },
    },
  });

  const map = new Map(rows.map((r) => [r.id, r]));

  for (const payload of payloads) {
    if (!payload) continue;
    const classId = payload.classId;
    if (typeof classId !== "string") continue;
    const row = map.get(classId);
    if (!row) continue;
    const ct = row.classType;
    payload.className = ct.name;
    payload.classTypeId = ct.id;
    payload.classTypeColor = ct.color;
    payload.classTypeIcon = ct.icon;
    payload.classTypeMediaUrl = ct.mediaUrl;
    payload.classTypeTags = ct.tags;
    payload.classTypeDescription = ct.description;
    payload.classTypeDuration = ct.duration;
    payload.classTypeLevel = ct.level;
    payload.coachName = row.coach.user.name;
    payload.coachUserId = row.coach.userId;
    payload.coachImage = row.coach.photoUrl || row.coach.user.image;
  }
}
