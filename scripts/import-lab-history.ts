/**
 * Import LAB tenant's historical booking CSV into the platform.
 *
 * ── EMAIL SAFETY ────────────────────────────────────────────────────────
 * This script writes ONLY through `prisma.*` directly. It does not call
 * NextAuth, `lib/email.ts`, `lib/push.ts`, the nudge engine, or any
 * cron-facing service. No FeedEvent / Notification / PushSubscription /
 * PendingPenalty / UserPackage / Entitlement / RevenueEvent rows are created.
 * As an extra belt-and-suspenders guard, any CSV row whose class date is
 * not strictly in the past is rejected (the `class-reminders` cron is the
 * only path that would email historical bookings if startsAt drifted into
 * the future).
 *
 * ── USAGE ───────────────────────────────────────────────────────────────
 *   npx tsx scripts/import-lab-history.ts --csv "<path>" --dry-run
 *   npx tsx scripts/import-lab-history.ts --csv "<path>" --commit
 *
 * Idempotent: re-running with the same CSV is a safe no-op. Booking ids are
 * derived deterministically from the CSV's "ID de reserva".
 */

import { readFileSync } from "fs";
import { prisma } from "../lib/db";
import type {
  BookingStatus,
  ClassStatus,
  MemberLifecycleStage,
  PlatformBookingStatus,
  PlatformType,
} from "@prisma/client";

const TENANT_SLUG = "lab";
const PLACEHOLDER_COACH_NAME = "Equipo LAB";
const DEFAULT_CLASS_DURATION_MIN = 50;
const DEFAULT_ROOM_CAPACITY = 30;
const ID_PREFIX = "lab_hist_";

// ── CLI args ────────────────────────────────────────────────────────────

function parseArgs(): { csvPath: string; commit: boolean } {
  const args = process.argv.slice(2);
  let csvPath = "";
  let commit = false;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--csv") csvPath = args[++i];
    else if (a === "--commit") commit = true;
    else if (a === "--dry-run") dryRun = true;
  }
  if (!csvPath) {
    console.error("usage: --csv <path> [--dry-run | --commit]");
    process.exit(1);
  }
  if (commit && dryRun) {
    console.error("error: pass only one of --dry-run or --commit");
    process.exit(1);
  }
  if (!commit && !dryRun) {
    console.error("error: pass --dry-run or --commit explicitly");
    process.exit(1);
  }
  return { csvPath, commit };
}

// ── CSV row shape ───────────────────────────────────────────────────────

type CsvRow = {
  "Fecha de la clase": string;
  "Hora de clase": string;
  "Día de clase": string;
  Clase: string;
  Ubicación: string;
  Entrenador: string;
  Contacto: string;
  Correo: string;
  "Fecha de reserva": string;
  "Hora de reserva": string;
  "Día de reserva": string;
  "Origen de reserva": string;
  "ID de reserva": string;
  "Reservado por": string;
  Estado: string;
  Asistencia: string;
  "Origen de check-in": string;
  "Cancelación tardía": string;
  "Origen de cancelación": string;
  "Cancelado por": string;
  "Fecha de cancelación": string;
  "Hora de cancelación": string;
  "Día de cancelación": string;
  "Valor de venta": string;
  "Pagado con": string;
  "Opción de pago": string;
  Espacios: string;
};

// ── Spanish date parsing ────────────────────────────────────────────────

const MONTHS_ES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** Parses "agosto 30, 2025" + "9:10" in `America/Mexico_City` → UTC Date. */
function parseClassDateTime(dateStr: string, timeStr: string, tz: string): Date | null {
  const dateMatch = dateStr.trim().match(/^([a-záéíóúñ]+)\s+(\d{1,2}),\s*(\d{4})$/i);
  if (!dateMatch) return null;
  const month = MONTHS_ES[dateMatch[1].toLowerCase()];
  if (!month) return null;
  const day = parseInt(dateMatch[2], 10);
  const year = parseInt(dateMatch[3], 10);

  const timeMatch = (timeStr || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch) return null;
  const hh = parseInt(timeMatch[1], 10);
  const mm = parseInt(timeMatch[2], 10);

  return zonedToUtc(year, month, day, hh, mm, tz);
}

/**
 * Convert wall-clock components in a named IANA tz to a UTC `Date`.
 * Iteratively corrects for DST by asking `Intl.DateTimeFormat` what UTC
 * offset that wall-clock has in the target tz. Two iterations is enough
 * for all real-world cases.
 */
function zonedToUtc(
  y: number, mo: number, d: number, h: number, mi: number, tz: string,
): Date {
  let utc = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const offsetMin = tzOffsetMinutes(new Date(utc), tz);
    utc = Date.UTC(y, mo - 1, d, h, mi) - offsetMin * 60 * 1000;
  }
  return new Date(utc);
}

function tzOffsetMinutes(at: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(at).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    +parts.year, +parts.month - 1, +parts.day,
    +parts.hour === 24 ? 0 : +parts.hour, +parts.minute, +parts.second,
  );
  return (asUtc - at.getTime()) / 60_000;
}

// ── Mapping helpers ─────────────────────────────────────────────────────

function normEmail(s: string): string {
  return s.trim().toLowerCase();
}

function studioCanonical(raw: string): string {
  const v = raw.trim();
  // CSV uses upper for permanent studios, mixed-case for pop-ups.
  if (v.toLowerCase() === "lululemon perisur") return "Lululemon Perisur";
  return v
    .toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
}

function mapBookingStatus(estado: string, asistencia: string): BookingStatus {
  if (estado === "Cancelado") return "CANCELLED";
  if (asistencia === "Asistió") return "ATTENDED";
  if (asistencia === "No asistió") return "NO_SHOW";
  return "CONFIRMED"; // "Pendiente" or unknown
}

function mapClassStatus(_estado: string): ClassStatus {
  // Every imported class is historical, so it's COMPLETED unless it has no
  // attended/confirmed bookings — but we can't tell from a single row, so
  // we mark COMPLETED uniformly. Admin can rewrite if needed.
  return "COMPLETED";
}

function mapPlatform(origen: string): PlatformType | null {
  if (origen === "Wellhub") return "wellhub";
  if (origen === "Totalpass") return "totalpass";
  return null;
}

function mapPlatformBookingStatus(
  asistencia: string,
  estado: string,
): PlatformBookingStatus {
  if (estado === "Cancelado") return "cancelled";
  if (asistencia === "Asistió") return "checked_in";
  if (asistencia === "No asistió") return "absent";
  return "confirmed";
}

function pickLifecycleStage(
  hasAttended: boolean,
  hasBooking: boolean,
): MemberLifecycleStage {
  if (hasAttended) return "attended";
  if (hasBooking) return "booked";
  return "lead";
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const { csvPath, commit } = parseArgs();

  console.log(`\n=== LAB historical import (${commit ? "COMMIT" : "DRY-RUN"}) ===`);
  console.log(`CSV: ${csvPath}`);

  // Resolve tenant + city + timezone.
  const tenant = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
    select: { id: true, name: true, defaultCountryId: true },
  });
  if (!tenant) throw new Error(`Tenant '${TENANT_SLUG}' not found`);

  // Pick a city from existing LAB studios (they all share one city).
  const anyStudio = await prisma.studio.findFirst({
    where: { tenantId: tenant.id },
    select: { cityId: true, city: { select: { timezone: true, name: true } } },
  });
  if (!anyStudio) {
    throw new Error(
      `LAB has no existing studios; cannot infer city/timezone. ` +
      `Create at least one studio in the admin first.`,
    );
  }
  const cityId = anyStudio.cityId;
  const tz = anyStudio.city.timezone;
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`City: ${anyStudio.city.name} / tz=${tz}`);

  // ── Parse CSV ─────────────────────────────────────────────────────────
  const buf = readFileSync(csvPath, "utf8");
  const rows = parseCsvToRecords(buf) as CsvRow[];
  console.log(`CSV rows: ${rows.length}`);

  // Dedupe by booking id (CSV has some exact duplicates).
  const seenIds = new Set<string>();
  const deduped: CsvRow[] = [];
  let dupCount = 0;
  for (const r of rows) {
    const id = r["ID de reserva"]?.trim();
    if (!id) continue;
    if (seenIds.has(id)) { dupCount++; continue; }
    seenIds.add(id);
    deduped.push(r);
  }
  console.log(`Deduped: ${deduped.length} (dropped ${dupCount} exact dups)`);

  // Safety: reject future-dated classes.
  const now = new Date();
  const inScope: CsvRow[] = [];
  let futureDropped = 0;
  let unparsedDropped = 0;
  let noEmailDropped = 0;
  for (const r of deduped) {
    const startsAt = parseClassDateTime(r["Fecha de la clase"], r["Hora de clase"], tz);
    if (!startsAt) { unparsedDropped++; continue; }
    if (startsAt >= now) { futureDropped++; continue; }
    const email = normEmail(r.Correo || "");
    if (!email) { noEmailDropped++; continue; }
    inScope.push(r);
  }
  console.log(
    `In-scope rows: ${inScope.length} ` +
    `(future-dropped=${futureDropped}, unparsed=${unparsedDropped}, no-email=${noEmailDropped})`,
  );

  // ── Plan: uniques ─────────────────────────────────────────────────────
  const emailToName = new Map<string, string>();
  const studioNames = new Set<string>();
  const classTypeNames = new Set<string>();
  const classKeyToInfo = new Map<
    string,
    { classTypeName: string; studioName: string; startsAt: Date }
  >();
  type PreparedBooking = {
    csvId: string;
    email: string;
    classKey: string;
    bookingStatus: BookingStatus;
    createdAt: Date | null;
    cancelledAt: Date | null;
    platform: PlatformType | null;
    platformBookingStatus: PlatformBookingStatus;
    paidWith: string;
    paymentOption: string;
    memberName: string;
  };
  const preparedBookings: PreparedBooking[] = [];
  const memberAggregate = new Map<
    string,
    { hasAttended: boolean; hasBooking: boolean; firstBookingAt: Date | null; firstAttendanceAt: Date | null }
  >();

  for (const r of inScope) {
    const email = normEmail(r.Correo);
    const name = r.Contacto?.trim() || "";
    if (name && !emailToName.has(email)) emailToName.set(email, name);

    const studioName = studioCanonical(r.Ubicación);
    studioNames.add(studioName);
    const classTypeName = r.Clase.trim();
    classTypeNames.add(classTypeName);
    const startsAt = parseClassDateTime(r["Fecha de la clase"], r["Hora de clase"], tz)!;
    const classKey = `${classTypeName}|${studioName}|${startsAt.toISOString()}`;
    if (!classKeyToInfo.has(classKey)) {
      classKeyToInfo.set(classKey, { classTypeName, studioName, startsAt });
    }

    const bookingStatus = mapBookingStatus(r.Estado, r.Asistencia);
    const createdAt = parseClassDateTime(r["Fecha de reserva"], r["Hora de reserva"], tz);
    const cancelledAt = parseClassDateTime(r["Fecha de cancelación"], r["Hora de cancelación"], tz);
    const platform = mapPlatform(r["Origen de reserva"]);
    const platformBookingStatus = mapPlatformBookingStatus(r.Asistencia, r.Estado);

    preparedBookings.push({
      csvId: r["ID de reserva"].trim(),
      email,
      classKey,
      bookingStatus,
      createdAt,
      cancelledAt,
      platform,
      platformBookingStatus,
      paidWith: r["Pagado con"]?.trim() || "",
      paymentOption: r["Opción de pago"]?.trim() || "",
      memberName: name,
    });

    let agg = memberAggregate.get(email);
    if (!agg) {
      agg = { hasAttended: false, hasBooking: false, firstBookingAt: null, firstAttendanceAt: null };
      memberAggregate.set(email, agg);
    }
    agg.hasBooking = true;
    if (createdAt && (!agg.firstBookingAt || createdAt < agg.firstBookingAt)) {
      agg.firstBookingAt = createdAt;
    }
    if (bookingStatus === "ATTENDED") {
      agg.hasAttended = true;
      if (startsAt && (!agg.firstAttendanceAt || startsAt < agg.firstAttendanceAt)) {
        agg.firstAttendanceAt = startsAt;
      }
    }
  }

  // ── Plan summary ──────────────────────────────────────────────────────
  // Existing entities we'll reuse.
  const existingStudios = await prisma.studio.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true, rooms: { select: { id: true, maxCapacity: true } } },
  });
  const existingClassTypes = await prisma.classType.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true },
  });
  const existingCoaches = await prisma.coachProfile.findMany({
    where: { tenantId: tenant.id, name: PLACEHOLDER_COACH_NAME },
    select: { id: true },
  });
  const existingUsersCount = await prisma.user.count({
    where: { email: { in: Array.from(memberAggregate.keys()) } },
  });
  const existingBookings = await prisma.booking.findMany({
    where: { tenantId: tenant.id, id: { startsWith: ID_PREFIX } },
    select: { id: true },
  });
  const existingBookingIds = new Set(existingBookings.map((b) => b.id));

  const studiosToCreate = Array.from(studioNames).filter(
    (n) => !existingStudios.some((s) => s.name.toLowerCase() === n.toLowerCase()),
  );
  const classTypesToCreate = Array.from(classTypeNames).filter(
    (n) => !existingClassTypes.some((ct) => ct.name.toLowerCase() === n.toLowerCase()),
  );
  const newBookings = preparedBookings.filter(
    (b) => !existingBookingIds.has(`${ID_PREFIX}${b.csvId}`),
  );

  console.log("\n── Plan ─────────────────────────────────────────────");
  console.log(`Users:           ${memberAggregate.size} unique (${existingUsersCount} already in DB)`);
  console.log(`Studios:         ${studioNames.size} unique (will create ${studiosToCreate.length}: ${studiosToCreate.join(", ") || "—"})`);
  console.log(`ClassTypes:      ${classTypeNames.size} unique (will create ${classTypesToCreate.length})`);
  console.log(`Placeholder coach: '${PLACEHOLDER_COACH_NAME}' (${existingCoaches.length ? "exists" : "will create"})`);
  console.log(`Classes:         ${classKeyToInfo.size} unique`);
  console.log(`Bookings:        ${preparedBookings.length} prepared (${newBookings.length} new, ${preparedBookings.length - newBookings.length} already imported)`);
  const wellhubCount = preparedBookings.filter((b) => b.platform === "wellhub").length;
  const totalpassCount = preparedBookings.filter((b) => b.platform === "totalpass").length;
  console.log(`PlatformBookings: wellhub=${wellhubCount}, totalpass=${totalpassCount}`);

  // Date range diagnostic.
  const allStarts = Array.from(classKeyToInfo.values()).map((c) => c.startsAt).sort((a, b) => +a - +b);
  if (allStarts.length) {
    console.log(`Class date range: ${allStarts[0].toISOString()} → ${allStarts[allStarts.length - 1].toISOString()}`);
  }

  if (!commit) {
    console.log("\n[dry-run] Nothing written. Re-run with --commit to apply.\n");
    return;
  }

  // ── Commit phase ──────────────────────────────────────────────────────
  console.log("\n── Writing to DB ────────────────────────────────────");

  // 1) Studios (+ default Rooms).
  const studioByName = new Map<string, { id: string; defaultRoomId: string }>();
  for (const s of existingStudios) {
    const roomId = s.rooms[0]?.id;
    if (roomId) studioByName.set(s.name.toLowerCase(), { id: s.id, defaultRoomId: roomId });
  }
  for (const name of studiosToCreate) {
    const studio = await prisma.studio.create({
      data: {
        name,
        tenantId: tenant.id,
        cityId,
      },
      select: { id: true },
    });
    const room = await prisma.room.create({
      data: {
        name: "Sala principal",
        studioId: studio.id,
        tenantId: tenant.id,
        maxCapacity: DEFAULT_ROOM_CAPACITY,
      },
      select: { id: true },
    });
    studioByName.set(name.toLowerCase(), { id: studio.id, defaultRoomId: room.id });
    console.log(`  + Studio: ${name} (room ${room.id})`);
  }
  // Backfill default room for existing studios that somehow have none.
  for (const s of existingStudios) {
    if (!s.rooms.length) {
      const room = await prisma.room.create({
        data: {
          name: "Sala principal",
          studioId: s.id,
          tenantId: tenant.id,
          maxCapacity: DEFAULT_ROOM_CAPACITY,
        },
        select: { id: true },
      });
      studioByName.set(s.name.toLowerCase(), { id: s.id, defaultRoomId: room.id });
      console.log(`  + Room for existing studio ${s.name}: ${room.id}`);
    }
  }

  // 2) ClassTypes.
  const classTypeByName = new Map<string, string>();
  for (const ct of existingClassTypes) classTypeByName.set(ct.name.toLowerCase(), ct.id);
  for (const name of classTypesToCreate) {
    const created = await prisma.classType.create({
      data: {
        name,
        tenantId: tenant.id,
        duration: DEFAULT_CLASS_DURATION_MIN,
        color: "#C9A96E",
      },
      select: { id: true },
    });
    classTypeByName.set(name.toLowerCase(), created.id);
    console.log(`  + ClassType: ${name}`);
  }

  // 3) Placeholder coach.
  let coachId: string;
  if (existingCoaches[0]) {
    coachId = existingCoaches[0].id;
  } else {
    const c = await prisma.coachProfile.create({
      data: {
        name: PLACEHOLDER_COACH_NAME,
        tenantId: tenant.id,
        bio: "Coach placeholder used to attach historical imported classes. Reassign in admin when ready.",
      },
      select: { id: true },
    });
    coachId = c.id;
    console.log(`  + CoachProfile: ${PLACEHOLDER_COACH_NAME} (${coachId})`);
  }

  // 4) Platform configs (isActive=false; admin can enable later).
  for (const platform of ["wellhub", "totalpass"] as const) {
    await prisma.studioPlatformConfig.upsert({
      where: { tenantId_platform: { tenantId: tenant.id, platform } },
      update: {},
      create: {
        tenantId: tenant.id,
        platform,
        isActive: false,
        // inboundEmail is globally @unique → namespace with tenant slug + platform.
        inboundEmail: `${TENANT_SLUG}-${platform}-historical@inbound.invalid`,
      },
    });
  }
  console.log(`  + StudioPlatformConfig (wellhub, totalpass) — isActive=false`);

  // 5) Users. Skip those already imported, then createMany the rest. Round-
  // trip latency to Supabase EU dominates — batching is 100× faster than
  // sequential upserts.
  console.log(`  Resolving users…`);
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: Array.from(memberAggregate.keys()) } },
    select: { id: true, email: true },
  });
  const userIdByEmail = new Map(existingUsers.map((u) => [u.email, u.id]));
  const usersToCreate: { email: string; name: string | null }[] = [];
  for (const email of memberAggregate.keys()) {
    if (!userIdByEmail.has(email)) {
      usersToCreate.push({ email, name: emailToName.get(email) || null });
    }
  }
  console.log(`    ${existingUsers.length} exist, ${usersToCreate.length} to create`);
  for (let i = 0; i < usersToCreate.length; i += 1000) {
    const batch = usersToCreate.slice(i, i + 1000);
    await prisma.user.createMany({
      data: batch.map((u) => ({ email: u.email, name: u.name, emailVerified: null })),
      skipDuplicates: true,
    });
    console.log(`    users created: ${Math.min(i + 1000, usersToCreate.length)}/${usersToCreate.length}`);
  }
  // Reload to capture IDs of newly created users.
  if (usersToCreate.length) {
    const reloaded = await prisma.user.findMany({
      where: { email: { in: usersToCreate.map((u) => u.email) } },
      select: { id: true, email: true },
    });
    for (const u of reloaded) userIdByEmail.set(u.email, u.id);
  }

  // 6) Memberships. createMany the missing ones; lifecycle is set at create
  // time only (no downgrade risk).
  console.log(`  Resolving memberships…`);
  const existingMemberships = await prisma.membership.findMany({
    where: { tenantId: tenant.id, userId: { in: Array.from(userIdByEmail.values()) } },
    select: { userId: true },
  });
  const existingMemUserIds = new Set(existingMemberships.map((m) => m.userId));
  const membershipsToCreate: {
    userId: string;
    tenantId: string;
    role: "CLIENT";
    lifecycleStage: MemberLifecycleStage;
    firstBookingAt: Date | null;
    firstAttendanceAt: Date | null;
  }[] = [];
  for (const [email, agg] of memberAggregate) {
    const userId = userIdByEmail.get(email);
    if (!userId || existingMemUserIds.has(userId)) continue;
    membershipsToCreate.push({
      userId,
      tenantId: tenant.id,
      role: "CLIENT",
      lifecycleStage: pickLifecycleStage(agg.hasAttended, agg.hasBooking),
      firstBookingAt: agg.firstBookingAt,
      firstAttendanceAt: agg.firstAttendanceAt,
    });
  }
  console.log(`    ${existingMemberships.length} exist, ${membershipsToCreate.length} to create`);
  for (let i = 0; i < membershipsToCreate.length; i += 1000) {
    const batch = membershipsToCreate.slice(i, i + 1000);
    await prisma.membership.createMany({ data: batch, skipDuplicates: true });
    console.log(`    memberships created: ${Math.min(i + 1000, membershipsToCreate.length)}/${membershipsToCreate.length}`);
  }

  // 7) Classes. Deterministic id + createMany skipDuplicates.
  console.log(`  Resolving classes…`);
  type ClassRow = {
    id: string;
    tenantId: string;
    classTypeId: string;
    coachId: string;
    roomId: string;
    startsAt: Date;
    endsAt: Date;
    status: ClassStatus;
  };
  const classIdByKey = new Map<string, string>();
  const classRows: ClassRow[] = [];
  for (const [classKey, info] of classKeyToInfo) {
    const studio = studioByName.get(info.studioName.toLowerCase());
    if (!studio) throw new Error(`No studio for ${info.studioName}`);
    const classTypeId = classTypeByName.get(info.classTypeName.toLowerCase());
    if (!classTypeId) throw new Error(`No classType for ${info.classTypeName}`);
    const id = `${ID_PREFIX}cls_${hashStable(classKey)}`;
    classIdByKey.set(classKey, id);
    classRows.push({
      id,
      tenantId: tenant.id,
      classTypeId,
      coachId,
      roomId: studio.defaultRoomId,
      startsAt: info.startsAt,
      endsAt: new Date(info.startsAt.getTime() + DEFAULT_CLASS_DURATION_MIN * 60_000),
      status: mapClassStatus(""),
    });
  }
  console.log(`    ${classRows.length} class rows to insert (skipDuplicates)`);
  for (let i = 0; i < classRows.length; i += 1000) {
    const batch = classRows.slice(i, i + 1000);
    await prisma.class.createMany({ data: batch, skipDuplicates: true });
    console.log(`    classes: ${Math.min(i + 1000, classRows.length)}/${classRows.length}`);
  }

  // 8) Bookings + PlatformBookings.
  console.log(`  Preparing bookings…`);
  type BookingRow = {
    id: string;
    classId: string;
    userId: string;
    tenantId: string;
    status: BookingStatus;
    spotNumber: null;
    createdAt: Date;
  };
  type PlatformBookingRow = {
    id: string;
    tenantId: string;
    classId: string;
    platform: PlatformType;
    platformBookingId: string;
    memberName: string | null;
    status: PlatformBookingStatus;
    source: string;
    parsedAt: Date | null;
    notes: string;
  };
  const bookingRows: BookingRow[] = [];
  const platformBookingRows: PlatformBookingRow[] = [];
  for (const b of preparedBookings) {
    const userId = userIdByEmail.get(b.email);
    if (!userId) continue;
    const classId = classIdByKey.get(b.classKey);
    if (!classId) continue;
    bookingRows.push({
      id: `${ID_PREFIX}${b.csvId}`,
      classId,
      userId,
      tenantId: tenant.id,
      status: b.bookingStatus,
      spotNumber: null,
      createdAt: b.createdAt ?? new Date(),
    });
    if (b.platform) {
      platformBookingRows.push({
        id: `${ID_PREFIX}pb_${b.csvId}`,
        tenantId: tenant.id,
        classId,
        platform: b.platform,
        platformBookingId: b.csvId,
        memberName: b.memberName || null,
        status: b.platformBookingStatus,
        source: "historical_import",
        parsedAt: b.createdAt ?? null,
        notes: `Imported from LAB historical CSV. Pagado con: ${b.paidWith}; Opción: ${b.paymentOption}`,
      });
    }
  }
  console.log(`    ${bookingRows.length} booking rows, ${platformBookingRows.length} platform-booking rows`);
  for (let i = 0; i < bookingRows.length; i += 1000) {
    const batch = bookingRows.slice(i, i + 1000);
    await prisma.booking.createMany({ data: batch, skipDuplicates: true });
    if ((i + 1000) % 5000 === 0 || i + 1000 >= bookingRows.length) {
      console.log(`    bookings: ${Math.min(i + 1000, bookingRows.length)}/${bookingRows.length}`);
    }
  }
  for (let i = 0; i < platformBookingRows.length; i += 1000) {
    const batch = platformBookingRows.slice(i, i + 1000);
    await prisma.platformBooking.createMany({ data: batch, skipDuplicates: true });
    if ((i + 1000) % 5000 === 0 || i + 1000 >= platformBookingRows.length) {
      console.log(`    platform-bookings: ${Math.min(i + 1000, platformBookingRows.length)}/${platformBookingRows.length}`);
    }
  }

  console.log(`\nDone.`);
}

/**
 * Minimal RFC 4180-style CSV parser. Handles quoted fields with embedded
 * commas and escaped quotes (""). Assumes no embedded newlines (true for
 * this export). Returns array of records keyed by the header row.
 */
function parseCsvToRecords(text: string): Record<string, string>[] {
  // Split into raw lines first; this CSV has no embedded newlines inside
  // quoted fields, so a simple line split is safe and fast.
  const lines: string[] = [];
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\r") continue;
    if (ch === "\n") { lines.push(buf); buf = ""; continue; }
    buf += ch;
  }
  if (buf.length) lines.push(buf);
  if (!lines.length) return [];

  const splitRow = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else cur += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { out.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  const header = splitRow(lines[0]);
  const records: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].length) continue;
    const cols = splitRow(lines[i]);
    const rec: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) rec[header[j]] = cols[j] ?? "";
    records.push(rec);
  }
  return records;
}

// Deterministic 12-char hash (FNV-1a) for class IDs.
function hashStable(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Pad to a positive base36 of 12 chars.
  const n = (h >>> 0).toString(36);
  return n.padStart(12, "0").slice(-12);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
