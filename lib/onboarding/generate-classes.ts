import { prisma } from "@/lib/db";
import { ClassStatus } from "@prisma/client";
import { addDays, setHours, setMinutes, addMinutes } from "date-fns";
import type { ExtractedScheduleSlot } from "./types";
import type { TenantStructure } from "./create-tenant-structure";
import { WEEKDAY_SLOTS, WEEKEND_SLOTS } from "./demo-constants";

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
  // Map discipline names to class type IDs
  const ctByName = new Map(classTypes.map((ct) => [ct.name.toLowerCase(), ct]));
  const coachByName = new Map(coachProfiles.map((c) => [c.name.toLowerCase(), c]));

  // Generate for 3 weeks: day -7 to day +14
  for (let weekOffset = -1; weekOffset <= 1; weekOffset++) {
    for (const slot of schedule) {
      // ISO dayOfWeek: 1=Mon..7=Sun → JS: 0=Sun..6=Sat
      const jsDow = slot.dayOfWeek === 7 ? 0 : slot.dayOfWeek;
      const currentDow = todayStart.getDay();
      let daysUntil = jsDow - currentDow;
      if (daysUntil < 0) daysUntil += 7;
      const date = addDays(todayStart, daysUntil + weekOffset * 7);

      const [hourStr, minStr] = slot.startTime.split(":");
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minStr, 10);
      const startsAt = setMinutes(setHours(date, hour), minute);

      const ct = ctByName.get(slot.disciplineName.toLowerCase()) || classTypes[0];
      const duration = slot.durationMinutes || ct.duration;
      const endsAt = addMinutes(startsAt, duration);

      const coach = slot.coachName
        ? coachByName.get(slot.coachName.toLowerCase()) || coachProfiles[allClasses.length % coachProfiles.length]
        : coachProfiles[allClasses.length % coachProfiles.length];

      const room = rooms[allClasses.length % rooms.length];
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
      const startsAt = setMinutes(setHours(date, slot.hour), slot.minute);
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
