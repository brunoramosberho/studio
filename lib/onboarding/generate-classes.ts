import { prisma } from "@/lib/db";
import { ClassStatus } from "@prisma/client";
import { addDays, addMinutes, setHours, setMinutes } from "date-fns";
import type { ExtractedScheduleSlot } from "./types";
import type { TenantStructure } from "./create-tenant-structure";
import { WEEKDAY_SLOTS, WEEKEND_SLOTS } from "./demo-constants";
import { zonedWallTimeToUtc } from "@/lib/utils";

/**
 * Given a "wall-clock" date (whose y/m/d/h/m fields were computed in server-local
 * time) and a target IANA timezone, return the UTC instant that corresponds to
 * those same wall-clock fields in that timezone.
 *
 * Needed because server-side code runs in UTC on Vercel; without this the class
 * generator stores "7:00 AM UTC" instead of "7:00 AM CDMX" (off by -6h / -5h).
 */
function wallClockInZone(date: Date, hour: number, minute: number, timeZone: string): Date {
  return zonedWallTimeToUtc(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute,
    timeZone,
  );
}

interface GeneratedClass {
  id: string;
  startsAt: Date;
  status: ClassStatus;
  classTypeId: string;
  coachId: string;
  roomId: string;
}

/**
 * Generate classes for 3 weeks: 1 past + 2 future.
 * If schedule slots are provided, uses those exact times.
 * Otherwise, generates from standard time slots.
 */
export async function generateClasses(
  structure: TenantStructure,
  schedule: ExtractedScheduleSlot[],
): Promise<{ past: GeneratedClass[]; future: GeneratedClass[] }> {
  const { tenantId, classTypes, coachProfiles, rooms } = structure;
  const today = new Date();
  const todayStart = setMinutes(setHours(today, 0), 0);

  const allClasses: GeneratedClass[] = [];

  if (schedule.length > 0) {
    // Use extracted schedule: repeat for 3 weeks (1 past, 2 future)
    await generateFromSchedule(
      schedule, tenantId, classTypes, coachProfiles, rooms, todayStart, allClasses,
    );
  } else {
    // Generate standard schedule
    await generateStandard(
      tenantId, classTypes, coachProfiles, rooms, todayStart, allClasses,
    );
  }

  const past = allClasses.filter((c) => c.status === ClassStatus.COMPLETED);
  const future = allClasses.filter((c) => c.status === ClassStatus.SCHEDULED);
  return { past, future };
}

async function generateFromSchedule(
  schedule: ExtractedScheduleSlot[],
  tenantId: string,
  classTypes: TenantStructure["classTypes"],
  coachProfiles: TenantStructure["coachProfiles"],
  rooms: TenantStructure["rooms"],
  todayStart: Date,
  allClasses: GeneratedClass[],
) {
  const ctByName = new Map(classTypes.map((ct) => [ct.name.toLowerCase(), ct]));
  const coachByName = new Map(coachProfiles.map((c) => [c.name.toLowerCase(), c]));

  // Build a full 7-day weekly template from the provided schedule.
  // If only some days are provided (e.g. Mon+Tue), replicate slots to fill the rest.
  const fullWeek = buildFullWeekSchedule(schedule, classTypes);

  // Generate for 3 weeks: day -7 to day +14
  for (let weekOffset = -1; weekOffset <= 1; weekOffset++) {
    for (const slot of fullWeek) {
      const jsDow = slot.dayOfWeek === 7 ? 0 : slot.dayOfWeek;
      const currentDow = todayStart.getDay();
      let daysUntil = jsDow - currentDow;
      if (daysUntil < 0) daysUntil += 7;
      const date = addDays(todayStart, daysUntil + weekOffset * 7);

      const [hourStr, minStr] = slot.startTime.split(":");
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minStr, 10);

      const ct = ctByName.get(slot.disciplineName.toLowerCase()) || classTypes[0];
      const duration = slot.durationMinutes || ct.duration;

      const coach = slot.coachName
        ? coachByName.get(slot.coachName.toLowerCase()) || coachProfiles[allClasses.length % coachProfiles.length]
        : coachProfiles[allClasses.length % coachProfiles.length];

      const room = rooms[allClasses.length % rooms.length];
      // Interpret hour/minute as wall-clock time in the studio's city timezone,
      // not in the server's timezone (which on Vercel is UTC).
      const startsAt = wallClockInZone(date, hour, minute, room.cityTimezone);
      const endsAt = addMinutes(startsAt, duration);
      const isPast = startsAt < todayStart;

      const cls = await prisma.class.create({
        data: {
          tenantId,
          classTypeId: ct.id,
          coachId: coach.id,
          roomId: room.id,
          startsAt,
          endsAt,
          status: isPast ? ClassStatus.COMPLETED : ClassStatus.SCHEDULED,
        },
      });

      allClasses.push({
        id: cls.id,
        startsAt,
        status: cls.status as ClassStatus,
        classTypeId: ct.id,
        coachId: coach.id,
        roomId: room.id,
      });
    }
  }
}

/**
 * Build a full 7-day weekly schedule from partial input.
 * If the user only provided Mon+Tue, replicate those slots across the remaining
 * weekdays (Wed-Fri) with rotated disciplines. Weekends get fewer slots.
 */
function buildFullWeekSchedule(
  schedule: ExtractedScheduleSlot[],
  classTypes: TenantStructure["classTypes"],
): ExtractedScheduleSlot[] {
  // Group provided slots by day
  const byDay = new Map<number, ExtractedScheduleSlot[]>();
  for (const slot of schedule) {
    const list = byDay.get(slot.dayOfWeek) ?? [];
    list.push(slot);
    byDay.set(slot.dayOfWeek, list);
  }

  const providedDays = [...byDay.keys()].sort();
  // If we already have 5+ days covered, no need to fill
  if (providedDays.length >= 5) return schedule;

  // Collect all unique time slots and disciplines from provided data
  const templateSlots = schedule.map((s) => ({
    startTime: s.startTime,
    durationMinutes: s.durationMinutes,
    disciplineName: s.disciplineName,
    coachName: s.coachName,
    confidence: "medium" as const,
  }));

  // All weekdays (1=Mon..5=Fri) and weekends (6=Sat, 7=Sun)
  const weekdays = [1, 2, 3, 4, 5];
  const weekendDays = [6, 7];

  const result: ExtractedScheduleSlot[] = [...schedule];

  // Fill missing weekdays by replicating provided slots with rotated disciplines
  const missingWeekdays = weekdays.filter((d) => !byDay.has(d));
  const allDisciplineNames = classTypes.map((ct) => ct.name);

  for (let i = 0; i < missingWeekdays.length; i++) {
    const day = missingWeekdays[i];
    // Use the template but rotate disciplines so it's not identical every day
    for (let j = 0; j < templateSlots.length; j++) {
      const tmpl = templateSlots[j];
      const rotatedDiscipline = allDisciplineNames.length > 0
        ? allDisciplineNames[(j + i) % allDisciplineNames.length]
        : tmpl.disciplineName;
      result.push({
        dayOfWeek: day,
        startTime: tmpl.startTime,
        durationMinutes: tmpl.durationMinutes,
        disciplineName: rotatedDiscipline,
        coachName: tmpl.coachName,
        confidence: "medium",
      });
    }
  }

  // Fill missing weekends with fewer slots (take first 60% of template)
  const missingWeekends = weekendDays.filter((d) => !byDay.has(d));
  const weekendSlotCount = Math.max(2, Math.ceil(templateSlots.length * 0.6));

  for (let i = 0; i < missingWeekends.length; i++) {
    const day = missingWeekends[i];
    for (let j = 0; j < weekendSlotCount && j < templateSlots.length; j++) {
      const tmpl = templateSlots[j];
      const rotatedDiscipline = allDisciplineNames.length > 0
        ? allDisciplineNames[(j + i + 2) % allDisciplineNames.length]
        : tmpl.disciplineName;
      result.push({
        dayOfWeek: day,
        startTime: tmpl.startTime,
        durationMinutes: tmpl.durationMinutes,
        disciplineName: rotatedDiscipline,
        coachName: tmpl.coachName,
        confidence: "medium",
      });
    }
  }

  return result;
}

async function generateStandard(
  tenantId: string,
  classTypes: TenantStructure["classTypes"],
  coachProfiles: TenantStructure["coachProfiles"],
  rooms: TenantStructure["rooms"],
  todayStart: Date,
  allClasses: GeneratedClass[],
) {
  const startDate = addDays(todayStart, -7);
  let idx = 0;

  for (let dayOffset = 0; dayOffset < 21; dayOffset++) {
    const date = addDays(startDate, dayOffset);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const slots = isWeekend ? WEEKEND_SLOTS : WEEKDAY_SLOTS;
    const isPast = date < todayStart;

    for (const slot of slots) {
      const ct = classTypes[idx % classTypes.length];
      const coach = coachProfiles[idx % coachProfiles.length];
      const room = rooms[idx % rooms.length];
      const startsAt = wallClockInZone(date, slot.hour, slot.minute, room.cityTimezone);
      const endsAt = addMinutes(startsAt, ct.duration);

      const cls = await prisma.class.create({
        data: {
          tenantId,
          classTypeId: ct.id,
          coachId: coach.id,
          roomId: room.id,
          startsAt,
          endsAt,
          status: isPast ? ClassStatus.COMPLETED : ClassStatus.SCHEDULED,
        },
      });

      allClasses.push({
        id: cls.id,
        startsAt,
        status: cls.status as ClassStatus,
        classTypeId: ct.id,
        coachId: coach.id,
        roomId: room.id,
      });
      idx++;
    }
  }
}
