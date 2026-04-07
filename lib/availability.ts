import { prisma } from "@/lib/db";
import {
  startOfWeek,
  endOfWeek,
  startOfDay,
  eachDayOfInterval,
} from "date-fns";

export type Zone = "green" | "yellow" | "red";

export interface ZoneThresholds {
  zoneRedDays?: number;
  zoneYellowDays?: number;
}

const DEFAULT_RED = 14;
const DEFAULT_YELLOW = 30;

export function getZone(
  startDate: Date,
  thresholds?: ZoneThresholds,
): Zone {
  const redDays = thresholds?.zoneRedDays ?? DEFAULT_RED;
  const yellowDays = thresholds?.zoneYellowDays ?? DEFAULT_YELLOW;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = (startDate.getTime() - today.getTime()) / 86_400_000;
  if (diffDays < redDays) return "red";
  if (diffDays < yellowDays) return "yellow";
  return "green";
}

export function getStatusForZone(zone: Zone): "active" | "pending_approval" {
  if (zone === "yellow") return "pending_approval";
  if (zone === "red")
    throw new Error("Cambios en zona roja solo los puede hacer el admin");
  return "active";
}

function getJsDow(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1;
}

export type CoverageStatus =
  | "available"
  | "partial"
  | "blocked"
  | "pending"
  | "empty";

export function getCoverageStatus(
  coachBlocks: {
    type: string;
    dayOfWeek: number[];
    startTime: string | null;
    endTime: string | null;
    startDate: Date | null;
    endDate: Date | null;
    isAllDay: boolean;
    status: string;
  }[],
  date: Date,
): CoverageStatus {
  const dow = getJsDow(date);
  const dayStart = startOfDay(date);

  for (const b of coachBlocks) {
    if (b.type === "one_time" && b.startDate && b.endDate) {
      const s = startOfDay(b.startDate);
      const e = startOfDay(b.endDate);
      if (dayStart >= s && dayStart <= e) {
        if (b.status === "pending_approval") return "pending";
        if (b.isAllDay) return "blocked";
        return "partial";
      }
    }
    if (
      b.type === "recurring" &&
      b.status === "active" &&
      b.dayOfWeek.includes(dow)
    ) {
      if (!b.startTime || !b.endTime) return "blocked";
      const startH = parseInt(b.startTime.split(":")[0]);
      const endH = parseInt(b.endTime.split(":")[0]);
      if (endH - startH >= 10) return "blocked";
      return "partial";
    }
  }
  return "available";
}

export async function getSubstituteSuggestions(
  classId: string,
  date: Date,
  tenantId: string,
) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      classType: true,
      coach: { select: { userId: true } },
    },
  });
  if (!cls) return [];

  const allProfiles = await prisma.coachProfile.findMany({
    where: { tenantId, userId: { not: cls.coach.userId } },
    include: { user: { select: { id: true, name: true, image: true } } },
  });

  const allBlocks = await prisma.coachAvailabilityBlock.findMany({
    where: {
      tenantId,
      coachId: { in: allProfiles.map((p) => p.userId) },
    },
  });

  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const weekClasses = await prisma.class.findMany({
    where: {
      tenantId,
      startsAt: { gte: weekStart, lte: weekEnd },
      status: "SCHEDULED",
    },
    select: { coachId: true },
  });

  const classCountByProfile: Record<string, number> = {};
  for (const c of weekClasses) {
    classCountByProfile[c.coachId] = (classCountByProfile[c.coachId] || 0) + 1;
  }

  const discipline = cls.classType.name.toLowerCase();

  type Suggestion = {
    coachProfileId: string;
    userId: string;
    name: string;
    image: string | null;
    available: boolean;
    hasDiscipline: boolean;
    weekLoad: number;
  };

  const suggestions: Suggestion[] = allProfiles.map((p) => {
    const coachBlocks = allBlocks.filter((b) => b.coachId === p.userId);
    const status = getCoverageStatus(coachBlocks, date);
    const available = status === "available" || status === "empty";
    const hasDiscipline = p.specialties.some(
      (s) => s.toLowerCase() === discipline,
    );
    const weekLoad = classCountByProfile[p.id] || 0;

    return {
      coachProfileId: p.id,
      userId: p.userId,
      name: p.user.name || "Coach",
      image: p.user.image,
      available,
      hasDiscipline,
      weekLoad,
    };
  });

  suggestions.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    if (a.hasDiscipline !== b.hasDiscipline) return a.hasDiscipline ? -1 : 1;
    return a.weekLoad - b.weekLoad;
  });

  return suggestions;
}
