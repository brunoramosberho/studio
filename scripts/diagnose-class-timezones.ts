/**
 * Diagnóstico: agrupa clases de un tenant por estudio + recurringId + hora
 * en la zona del estudio y el hora "cruda" (UTC H:M), para identificar
 * candidatas al fix de timezone.
 *
 * Uso:
 *   npx tsx scripts/diagnose-class-timezones.ts --tenant=betoro
 *   npx tsx scripts/diagnose-class-timezones.ts --tenant=betoro --from=2026-04-01
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}
const SLUG = getArg("tenant");
const FROM = getArg("from");
const TO = getArg("to");

if (!SLUG) {
  console.error("Missing --tenant=<slug>");
  process.exit(1);
}

function wallClockInZone(date: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const h = parts.find((p) => p.type === "hour")?.value ?? "??";
  const m = parts.find((p) => p.type === "minute")?.value ?? "??";
  return `${h}:${m}`;
}

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: SLUG! },
    select: { id: true, name: true },
  });
  if (!tenant) throw new Error(`Tenant ${SLUG} no encontrado`);

  console.log(`Tenant: ${tenant.name}`);
  console.log(`Rango: ${FROM ?? "inicio"} → ${TO ?? "fin"}\n`);

  const classes = await prisma.class.findMany({
    where: {
      tenantId: tenant.id,
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

  console.log(`Total clases: ${classes.length}\n`);

  // Group by studio + recurringId + rawUTCTime + tzWallTime
  type Key = string;
  const groups = new Map<
    Key,
    {
      studio: string;
      tz: string;
      recurringId: string | null;
      rawUTC: string;
      tzWall: string;
      delta: number; // tzWall - rawUTC in hours
      count: number;
      firstDate: Date;
      lastDate: Date;
      createdAt: Date;
      sampleIds: string[];
    }
  >();

  for (const c of classes) {
    const tz = c.room?.studio?.city?.timezone ?? "UTC";
    const studio = c.room?.studio?.name ?? "?";
    const rawUTC = `${String(c.startsAt.getUTCHours()).padStart(2, "0")}:${String(c.startsAt.getUTCMinutes()).padStart(2, "0")}`;
    const tzWall = wallClockInZone(c.startsAt, tz);
    const utcH = c.startsAt.getUTCHours() + c.startsAt.getUTCMinutes() / 60;
    const [twh, twm] = tzWall.split(":").map(Number);
    const tzH = twh + twm / 60;
    let delta = tzH - utcH;
    if (delta < -12) delta += 24;
    if (delta > 12) delta -= 24;

    const key = `${studio}|${c.recurringId ?? "single"}|${rawUTC}|${tzWall}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      if (c.startsAt < existing.firstDate) existing.firstDate = c.startsAt;
      if (c.startsAt > existing.lastDate) existing.lastDate = c.startsAt;
      if (existing.sampleIds.length < 3) existing.sampleIds.push(c.id);
    } else {
      groups.set(key, {
        studio,
        tz,
        recurringId: c.recurringId,
        rawUTC,
        tzWall,
        delta,
        count: 1,
        firstDate: c.startsAt,
        lastDate: c.startsAt,
        createdAt: c.createdAt,
        sampleIds: [c.id],
      });
    }
  }

  const sorted = [...groups.values()].sort(
    (a, b) => a.firstDate.getTime() - b.firstDate.getTime(),
  );

  console.log(
    "STUDIO                         | SERIES           | RAW UTC | TZ-WALL  | Δ h  | N   | FIRST DATE          | LAST DATE           | SAMPLE IDs",
  );
  console.log("-".repeat(180));
  for (const g of sorted) {
    const studioCol = g.studio.padEnd(30).slice(0, 30);
    const rid = (g.recurringId ?? "single").padEnd(16).slice(0, 16);
    console.log(
      `${studioCol} | ${rid} | ${g.rawUTC}   | ${g.tzWall}    | ${g.delta.toFixed(2).padStart(5)} | ${String(g.count).padStart(3)} | ${g.firstDate.toISOString().slice(0, 19)} | ${g.lastDate.toISOString().slice(0, 19)} | ${g.sampleIds.join(", ")}`,
    );
  }

  console.log("");
  console.log(
    "Lectura: si 'TZ-WALL' es la hora *que ves en la app* y no la que quisiste,",
  );
  console.log(
    "entonces la hora correcta es 'RAW UTC'. En ese caso el fix re-graba el",
  );
  console.log(
    "wall-clock de RAW UTC como wall-clock en la TZ del estudio.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
