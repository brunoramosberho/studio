import { prisma } from "@/lib/db";
import { BookingStatus, Role } from "@prisma/client";
import { addMinutes } from "date-fns";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { TenantStructure } from "./create-tenant-structure";
import {
  DEMO_USER_NAMES,
  DEMO_CAPTIONS,
  DEMO_COMMENTS,
  DEMO_PHOTO_URLS,
} from "./demo-constants";

interface ClassInfo {
  id: string;
  startsAt: Date;
  classTypeId: string;
  coachId: string;
  roomId: string;
}

export interface DemoActivityResult {
  userCount: number;
  bookingCount: number;
  feedEventCount: number;
}

export async function generateDemoActivity(
  structure: TenantStructure,
  pastClasses: ClassInfo[],
  futureClasses: ClassInfo[],
): Promise<DemoActivityResult> {
  const { tenantId, classTypes, coachProfiles } = structure;
  let bookingCount = 0;
  let feedEventCount = 0;

  // 1. Create filler users
  const fillerUsers: { id: string; name: string; image: string }[] = [];
  for (let i = 0; i < DEMO_USER_NAMES.length; i++) {
    const u = await prisma.user.create({
      data: {
        email: `demo-${tenantId.slice(-6)}-${i}@demo.mgic.app`,
        name: DEMO_USER_NAMES[i],
        role: Role.CLIENT,
        image: `https://i.pravatar.cc/200?img=${(i % 70) + 1}`,
      },
    });
    await prisma.membership.create({
      data: { userId: u.id, tenantId, role: Role.CLIENT },
    });
    fillerUsers.push({ id: u.id, name: u.name!, image: u.image! });
  }

  // 2. Bookings for past classes (ATTENDED) + feed events
  const ctMap = new Map(classTypes.map((ct) => [ct.id, ct]));
  const coachMap = new Map(coachProfiles.map((c) => [c.id, c]));

  const pastLimit = Math.min(pastClasses.length, 40);
  for (let i = 0; i < pastLimit; i++) {
    const cls = pastClasses[i];
    const ct = ctMap.get(cls.classTypeId);
    const coach = coachMap.get(cls.coachId);
    if (!ct || !coach) continue;

    // Book 5-10 users per past class
    const numAttendees = 5 + (i % 6);
    const attendees: { id: string; name: string; image: string | null }[] = [];

    for (let j = 0; j < numAttendees && j < fillerUsers.length; j++) {
      const user = fillerUsers[(i * 3 + j) % fillerUsers.length];
      // Check uniqueness
      if (attendees.some((a) => a.id === user.id)) continue;
      try {
        await prisma.booking.create({
          data: {
            tenantId,
            classId: cls.id,
            userId: user.id,
            status: BookingStatus.ATTENDED,
            spotNumber: j + 1,
          },
        });
        attendees.push({ id: user.id, name: user.name, image: user.image });
        bookingCount++;
      } catch {
        /* unique constraint */
      }
    }

    if (attendees.length < 2) continue;

    // Create CLASS_COMPLETED feed event
    const caption = DEMO_CAPTIONS[i % DEMO_CAPTIONS.length];
    const postedAt = addMinutes(cls.startsAt, 30 + (i % 90));

    const feedEvent = await prisma.feedEvent.create({
      data: {
        tenantId,
        userId: coach.userId,
        eventType: "CLASS_COMPLETED",
        visibility: "STUDIO_WIDE",
        createdAt: postedAt,
        payload: {
          classId: cls.id,
          className: ct.name,
          classTypeIcon: ct.icon,
          classTypeColor: ct.color,
          coachName: coach.name,
          coachUserId: coach.userId,
          date: format(cls.startsAt, "EEEE d 'de' MMMM", { locale: es }),
          time: format(cls.startsAt, "h:mm a"),
          duration: ct.duration,
          attendees: attendees.slice(0, 8),
          attendeeCount: attendees.length,
          ...(caption ? { caption } : {}),
        },
      },
    });
    feedEventCount++;

    // Add 1-2 photos
    const photoCount = 1 + (i % 2);
    for (let p = 0; p < photoCount; p++) {
      const url = DEMO_PHOTO_URLS[(i + p) % DEMO_PHOTO_URLS.length];
      const uploader = attendees[p % attendees.length];
      await prisma.photo.create({
        data: {
          userId: uploader.id,
          feedEventId: feedEvent.id,
          url,
          mimeType: "image/jpeg",
        },
      });
    }

    // Add likes (3-8 per event)
    const numLikes = 3 + (i % 6);
    for (let l = 0; l < numLikes && l < fillerUsers.length; l++) {
      const liker = fillerUsers[(i * 2 + l + 5) % fillerUsers.length];
      if (liker.id === coach.userId) continue;
      try {
        await prisma.like.create({
          data: { userId: liker.id, feedEventId: feedEvent.id, type: "like" },
        });
      } catch {
        /* unique */
      }
    }

    // Add 1 comment on every 3rd event
    if (i % 3 === 0) {
      const commenter = fillerUsers[(i + 7) % fillerUsers.length];
      await prisma.comment.create({
        data: {
          userId: commenter.id,
          feedEventId: feedEvent.id,
          body: DEMO_COMMENTS[i % DEMO_COMMENTS.length],
        },
      });
    }
  }

  // 3. Bookings for future classes (CONFIRMED, 40-70% capacity)
  const futureLimit = Math.min(futureClasses.length, 30);
  for (let i = 0; i < futureLimit; i++) {
    const cls = futureClasses[i];
    const numToBook = 3 + (i % 5); // 3-7 bookings

    for (let j = 0; j < numToBook && j < fillerUsers.length; j++) {
      const user = fillerUsers[(i * 4 + j) % fillerUsers.length];
      try {
        await prisma.booking.create({
          data: {
            tenantId,
            classId: cls.id,
            userId: user.id,
            status: BookingStatus.CONFIRMED,
            spotNumber: j + 1,
          },
        });
        bookingCount++;
      } catch {
        /* unique constraint */
      }
    }
  }

  // 4. A few friendships between demo users
  for (let i = 0; i < 5 && i < fillerUsers.length - 1; i++) {
    try {
      await prisma.friendship.create({
        data: {
          tenantId,
          requesterId: fillerUsers[i].id,
          addresseeId: fillerUsers[i + 1].id,
          status: "ACCEPTED",
        },
      });
    } catch {
      /* unique */
    }
  }

  return {
    userCount: fillerUsers.length,
    bookingCount,
    feedEventCount,
  };
}
