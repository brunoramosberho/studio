/**
 * Carga datos de demo para Camila Toro (dueña Be Toro) sin tocar el tenant.
 *
 * - NO hace update/delete sobre `Tenant` (branding, colores, etc. quedan igual).
 * - Solo upsert de User, Membership, Friendship y create de Bookings ATTENDED
 *   en clases pasadas (idempotente: no duplica reservas por clase).
 *
 * Uso (apunta DATABASE_URL a la BD que quieras, p. ej. producción):
 *   TENANT_SLUG=betoro npx tsx prisma/seed-camila-toro.ts
 *
 * Si usas otro slug de tenant:
 *   TENANT_SLUG=tu-slug npx tsx prisma/seed-camila-toro.ts
 */

import {
  PrismaClient,
  Role,
  BookingStatus,
  FriendshipStatus,
  BookingPrivacy,
} from "@prisma/client";

const prisma = new PrismaClient();

const CAMILA_EMAIL = "camilatorodc@gmail.com";
const CAMILA_NAME = "Camila Toro";
const TENANT_SLUG = process.env.TENANT_SLUG?.trim() || "betoro";

const AVATAR_URL =
  "https://api.dicebear.com/7.x/avataaars/png?seed=CamilaToro&size=128";

async function pickFreeSpot(
  classId: string,
  maxCapacity: number,
): Promise<number | null> {
  const rows = await prisma.booking.findMany({
    where: { classId, spotNumber: { not: null } },
    select: { spotNumber: true },
  });
  const taken = new Set(
    rows.map((r) => r.spotNumber).filter((n): n is number => n != null),
  );
  for (let i = 1; i <= maxCapacity; i++) {
    if (!taken.has(i)) return i;
  }
  return null;
}

async function upsertFriendship(
  tenantId: string,
  requesterId: string,
  addresseeId: string,
  status: FriendshipStatus,
) {
  await prisma.friendship.upsert({
    where: {
      requesterId_addresseeId_tenantId: {
        requesterId,
        addresseeId,
        tenantId,
      },
    },
    create: { requesterId, addresseeId, tenantId, status },
    update: { status },
  });
}

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
    select: { id: true, name: true, slug: true },
  });

  if (!tenant) {
    console.error(`No existe tenant con slug "${TENANT_SLUG}". Abortado.`);
    process.exit(1);
  }

  console.log(
    `\n✓ Tenant encontrado: "${tenant.name}" (${tenant.slug}) — sin modificar su fila ni branding.\n`,
  );

  const camila = await prisma.user.upsert({
    where: { email: CAMILA_EMAIL },
    create: {
      email: CAMILA_EMAIL,
      name: CAMILA_NAME,
      emailVerified: new Date(),
      image: AVATAR_URL,
    },
    update: {
      name: CAMILA_NAME,
    },
  });

  const withImage = await prisma.user.findUnique({
    where: { id: camila.id },
    select: { image: true },
  });
  if (!withImage?.image) {
    await prisma.user.update({
      where: { id: camila.id },
      data: { image: AVATAR_URL },
    });
  }

  console.log(`✓ Usuario: ${CAMILA_EMAIL} — ${camila.id}`);

  await prisma.membership.upsert({
    where: {
      userId_tenantId: { userId: camila.id, tenantId: tenant.id },
    },
    create: {
      userId: camila.id,
      tenantId: tenant.id,
      role: Role.ADMIN,
    },
    update: { role: Role.ADMIN },
  });
  console.log("✓ Membresía: ADMIN en este tenant (dueña / admin).\n");

  const otherMembers = await prisma.membership.findMany({
    where: { tenantId: tenant.id, userId: { not: camila.id } },
    select: { userId: true },
    take: 40,
  });
  const pool = [...new Set(otherMembers.map((m) => m.userId))];

  if (pool.length >= 3) {
    await upsertFriendship(
      tenant.id,
      camila.id,
      pool[0]!,
      FriendshipStatus.ACCEPTED,
    );
    await upsertFriendship(
      tenant.id,
      camila.id,
      pool[1]!,
      FriendshipStatus.ACCEPTED,
    );
    await upsertFriendship(
      tenant.id,
      pool[2]!,
      camila.id,
      FriendshipStatus.ACCEPTED,
    );
    console.log("✓ 3 amistades ACCEPTED (Camila ↔ miembros del estudio).");
  } else {
    console.warn(
      `⚠ Menos de 3 miembros aparte de Camila (${pool.length}). No se crearon amigos.`,
    );
  }

  if (pool.length >= 4) {
    await upsertFriendship(
      tenant.id,
      pool[3]!,
      camila.id,
      FriendshipStatus.PENDING,
    );
    console.log("✓ 1 solicitud entrante (PENDING → Camila).");
  }

  if (pool.length >= 5) {
    await upsertFriendship(
      tenant.id,
      camila.id,
      pool[4]!,
      FriendshipStatus.PENDING,
    );
    console.log("✓ 1 solicitud saliente (Camila → otro miembro).");
  }

  if (pool.length < 4) {
    console.warn(
      "⚠ Pocos miembros: faltan solicitudes PENDING (hacen falta ≥4 y ≥5 para entrante/saliente).\n",
    );
  } else {
    console.log("");
  }

  const pastClasses = await prisma.class.findMany({
    where: {
      tenantId: tenant.id,
      startsAt: { lt: new Date() },
      status: { not: "CANCELLED" },
    },
    orderBy: { startsAt: "desc" },
    take: 10,
    select: {
      id: true,
      startsAt: true,
      room: { select: { maxCapacity: true } },
    },
  });

  let added = 0;
  for (const c of pastClasses) {
    const existing = await prisma.booking.findFirst({
      where: { classId: c.id, userId: camila.id },
    });
    if (existing) continue;

    const spot = await pickFreeSpot(c.id, c.room.maxCapacity);
    await prisma.booking.create({
      data: {
        tenantId: tenant.id,
        classId: c.id,
        userId: camila.id,
        status: BookingStatus.ATTENDED,
        spotNumber: spot,
        privacy: BookingPrivacy.PUBLIC,
      },
    });
    added++;
  }

  console.log(
    `✓ Clases pasadas con asistencia (ATTENDED): +${added} reservas nuevas (revisadas ${pastClasses.length} clases en el pasado).\n`,
  );

  console.log(
    "Listo. Camila puede iniciar sesión con Google usando este correo (o el flujo que tengáis en producción).\n",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
