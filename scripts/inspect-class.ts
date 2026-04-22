/**
 * Imprime detalles finos (createdAt, updatedAt, recurringId, starts/ends en
 * UTC y en la TZ del estudio) para un conjunto de clases de un tenant,
 * opcionalmente filtradas por recurringId o rango de fechas.
 *
 * Uso:
 *   npx tsx scripts/inspect-class.ts --tenant=betoro --recurring=rec_177687099990
 *   npx tsx scripts/inspect-class.ts --tenant=betoro --from=2026-06-22 --to=2026-06-22
 *   npx tsx scripts/inspect-class.ts --tenant=betoro --since=2026-04-20
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}
const SLUG = getArg("tenant");
const RECURRING = getArg("recurring");
const FROM = getArg("from");
const TO = getArg("to");
const SINCE = getArg("since");

if (!SLUG) {
  console.error("Missing --tenant=<slug>");
  process.exit(1);
}

function wall(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: SLUG! },
    select: { id: true, name: true },
  });
  if (!tenant) throw new Error(`Tenant ${SLUG} no encontrado`);

  const classes = await prisma.class.findMany({
    where: {
      tenantId: tenant.id,
      ...(RECURRING ? { recurringId: RECURRING } : {}),
      ...(FROM || TO
        ? {
            startsAt: {
              ...(FROM ? { gte: new Date(`${FROM}T00:00:00Z`) } : {}),
              ...(TO ? { lte: new Date(`${TO}T23:59:59Z`) } : {}),
            },
          }
        : {}),
    },
    include: { room: { include: { studio: { include: { city: true } } } } },
    orderBy: { startsAt: "asc" },
  });

  // The Class model has no createdAt; we order by startsAt and infer creation
  // order from the id (cuid-like: lexicographic id order ≈ creation order).
  console.log(`Tenant: ${tenant.name}  |  Total: ${classes.length}\n`);
  console.log(
    "ID                         | STUDIO      | RECURRING        | starts UTC          | starts MADRID-TZ",
  );
  console.log("-".repeat(150));
  for (const c of classes) {
    const tz = c.room?.studio?.city?.timezone ?? "UTC";
    const studio = (c.room?.studio?.name ?? "?").padEnd(11).slice(0, 11);
    const rid = (c.recurringId ?? "single").padEnd(16).slice(0, 16);
    console.log(
      `${c.id.padEnd(26).slice(0, 26)} | ${studio} | ${rid} | ${c.startsAt.toISOString().slice(0, 19)} | ${wall(c.startsAt, tz)}`,
    );
  }
  void SINCE;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
