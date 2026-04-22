/**
 * Corrige clases cuyos horarios se guardaron interpretando la hora en UTC (bug
 * del endpoint /api/classes/bulk cuando corría en Vercel con setHours en TZ
 * del servidor) en lugar de en la zona horaria de la ciudad del estudio.
 *
 * Síntoma: una clase que debía ser "08:15 AM Madrid" aparece como "10:15 AM
 * Madrid" porque se guardó como 08:15 UTC (= 10:15 CEST).
 *
 * Fix: para cada clase del tenant, lee los componentes wall-clock del
 * `startsAt` actual (los UTC H/M) y los re-interpreta como wall-clock en la
 * timezone de la ciudad del estudio. Ajusta `endsAt` con el mismo delta.
 *
 * ⚠️  NO ES IDEMPOTENTE: una vez aplicado, los UTC components ya no coinciden
 * con el wall-clock local. Por eso el script detecta si la clase YA está en
 * horario comercial razonable del estudio (5am–11pm) y la skipea. Aun así,
 * evita reaplicar salvo que sepas lo que haces (--force ignora el guard).
 *
 * Uso:
 *   npx tsx scripts/fix-class-timezones.ts --tenant=betoro
 *   npx tsx scripts/fix-class-timezones.ts --tenant=betoro --apply
 *   npx tsx scripts/fix-class-timezones.ts --tenant=betoro --from=2026-04-20 --to=2026-12-31 --apply
 *   npx tsx scripts/fix-class-timezones.ts --tenant=betoro --studio=chamberi --apply
 *   npx tsx scripts/fix-class-timezones.ts --tenant=betoro --apply --force
 */
import { PrismaClient } from "@prisma/client";
import { zonedWallTimeToUtc } from "../lib/utils";

const prisma = new PrismaClient();

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}
const SLUG = getArg("tenant");
const FROM = getArg("from");
const TO = getArg("to");
const STUDIO_FILTER = getArg("studio")?.toLowerCase();
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

if (!SLUG) {
  console.error("Missing --tenant=<slug>. Example: --tenant=betoro");
  process.exit(1);
}

function hourInZone(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
  });
  return Number(dtf.formatToParts(date).find((p) => p.type === "hour")?.value);
}

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: SLUG! },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) throw new Error(`Tenant ${SLUG} no encontrado`);

  console.log(`[fix-tz] Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`[fix-tz] Modo:   ${APPLY ? "APPLY (persiste cambios)" : "DRY-RUN"}`);
  if (FROM) console.log(`[fix-tz] Desde:  ${FROM}`);
  if (TO) console.log(`[fix-tz] Hasta:  ${TO}`);
  if (STUDIO_FILTER) console.log(`[fix-tz] Studio: contiene "${STUDIO_FILTER}"`);
  if (FORCE) console.log(`[fix-tz] ⚠️  FORCE: ignora guard de horario comercial`);

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
    include: {
      room: { include: { studio: { include: { city: true } } } },
    },
    orderBy: { startsAt: "asc" },
  });

  console.log(`[fix-tz] Clases candidatas: ${classes.length}`);

  let fixed = 0;
  let skippedNoTz = 0;
  let skippedNoDelta = 0;
  let skippedBusinessHours = 0;
  let skippedStudio = 0;
  const samples: string[] = [];

  for (const cls of classes) {
    const studioName = cls.room?.studio?.name ?? "";
    if (STUDIO_FILTER && !studioName.toLowerCase().includes(STUDIO_FILTER)) {
      skippedStudio++;
      continue;
    }

    const tz = cls.room?.studio?.city?.timezone;
    if (!tz) {
      skippedNoTz++;
      continue;
    }

    const current = cls.startsAt;

    // Guard: si el startsAt actual YA cae en horario razonable de estudio
    // (5am–11pm en la tz del estudio), está bien. Skipea para evitar
    // doble-shift.
    if (!FORCE) {
      const h = hourInZone(current, tz);
      if (h >= 5 && h <= 23) {
        skippedBusinessHours++;
        continue;
      }
    }

    // Los componentes UTC actuales son los que se "quisieron" como wall-clock
    // en la zona del estudio.
    const newStartsAt = zonedWallTimeToUtc(
      current.getUTCFullYear(),
      current.getUTCMonth(),
      current.getUTCDate(),
      current.getUTCHours(),
      current.getUTCMinutes(),
      tz,
    );

    if (newStartsAt.getTime() === current.getTime()) {
      skippedNoDelta++;
      continue;
    }

    const deltaMs = newStartsAt.getTime() - current.getTime();
    const newEndsAt = new Date(cls.endsAt.getTime() + deltaMs);

    if (samples.length < 8) {
      samples.push(
        `  ${cls.id} [${studioName}]: ${current.toISOString()} → ${newStartsAt.toISOString()} (${tz}, Δ ${(
          deltaMs / 3_600_000
        ).toFixed(2)}h)`,
      );
    }

    if (APPLY) {
      await prisma.class.update({
        where: { id: cls.id },
        data: { startsAt: newStartsAt, endsAt: newEndsAt },
      });
    }
    fixed++;
  }

  console.log("");
  console.log(`[fix-tz] A corregir:                 ${fixed}`);
  console.log(`[fix-tz] Sin cambios (ya ok):        ${skippedNoDelta}`);
  console.log(`[fix-tz] Skipeadas (horario comercial, usa --force si hace falta): ${skippedBusinessHours}`);
  console.log(`[fix-tz] Skipeadas (sin TZ de ciudad): ${skippedNoTz}`);
  if (STUDIO_FILTER) console.log(`[fix-tz] Skipeadas (otro studio):    ${skippedStudio}`);
  if (samples.length > 0) {
    console.log("");
    console.log(`[fix-tz] Muestras:`);
    for (const s of samples) console.log(s);
  }
  if (!APPLY && fixed > 0) {
    console.log("");
    console.log(`[fix-tz] Dry-run; re-ejecuta con --apply para persistir.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
