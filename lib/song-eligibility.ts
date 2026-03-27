import { prisma } from "@/lib/db";
import { isSameWeek } from "date-fns";

export type SongCriteria =
  | "ALL"
  | "BIRTHDAY_WEEK"
  | "ANNIVERSARY"
  | "FIRST_CLASS"
  | "CLASS_MILESTONE";

const MILESTONES = [10, 25, 50, 100, 150, 200, 300, 500];

export async function checkSongEligibility(
  userId: string,
  classStartsAt: Date,
  criteria: string[],
  tenantId: string,
): Promise<boolean> {
  if (criteria.length === 0 || criteria.includes("ALL")) return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { birthday: true },
  });

  for (const c of criteria) {
    switch (c) {
      case "BIRTHDAY_WEEK": {
        if (!user?.birthday) break;
        const bday = new Date(user.birthday);
        const classDate = new Date(classStartsAt);
        const birthdayThisYear = new Date(
          classDate.getFullYear(),
          bday.getMonth(),
          bday.getDate(),
        );
        if (isSameWeek(birthdayThisYear, classDate, { weekStartsOn: 1 })) return true;
        break;
      }

      case "ANNIVERSARY": {
        const firstBooking = await prisma.booking.findFirst({
          where: { userId, tenantId, status: "ATTENDED" },
          orderBy: { class: { startsAt: "asc" } },
          select: { class: { select: { startsAt: true } } },
        });
        if (!firstBooking) break;
        const firstDate = firstBooking.class.startsAt;
        const classDate = new Date(classStartsAt);
        if (
          firstDate.getMonth() === classDate.getMonth() &&
          firstDate.getDate() === classDate.getDate() &&
          classDate.getFullYear() > firstDate.getFullYear()
        ) {
          return true;
        }
        if (isSameWeek(
          new Date(classDate.getFullYear(), firstDate.getMonth(), firstDate.getDate()),
          classDate,
          { weekStartsOn: 1 },
        )) {
          return true;
        }
        break;
      }

      case "FIRST_CLASS": {
        const bookingCount = await prisma.booking.count({
          where: { userId, tenantId, status: { in: ["CONFIRMED", "ATTENDED"] } },
        });
        if (bookingCount <= 1) return true;
        break;
      }

      case "CLASS_MILESTONE": {
        const totalAttended = await prisma.booking.count({
          where: { userId, tenantId, status: "ATTENDED" },
        });
        const currentCount = totalAttended + 1;
        if (MILESTONES.includes(currentCount)) return true;
        break;
      }
    }
  }

  return false;
}
