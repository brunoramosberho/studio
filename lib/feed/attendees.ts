import { prisma } from "@/lib/db";

export type FeedAttendee = {
  id: string;
  name: string;
  image: string | null;
  /** True for guest / platform (Wellhub, Gympass) bookings with no linked member. */
  isGuest: boolean;
};

type AttendeeBooking = {
  id: string;
  userId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  user?: { id: string; name: string | null; image: string | null } | null;
};

/**
 * Build the attendee list for a CLASS_COMPLETED feed post.
 *
 * Includes app members (linked `User`) **and** guest / platform bookings
 * (Wellhub, Gympass) that have no linked user, so the post reflects everyone
 * who actually attended. Guests show their name + initials avatar but aren't
 * tappable — unless their booking email matches a member of this tenant, in
 * which case they link to that member's profile.
 *
 * Callers pass the bookings they consider "present" (already filtered for
 * attendance / not cancelled). The helper handles user-vs-guest mapping,
 * email→member resolution, and de-duplication.
 */
export async function buildClassAttendees(
  bookings: AttendeeBooking[],
  tenantId: string,
): Promise<FeedAttendee[]> {
  // Resolve guest emails to tenant members so e.g. a Wellhub booking made with
  // an email that also has an account links to that person's profile.
  const guestEmails = [
    ...new Set(
      bookings
        .filter((b) => !b.userId && b.guestEmail)
        .map((b) => b.guestEmail!.toLowerCase()),
    ),
  ];

  const emailToUser = new Map<
    string,
    { id: string; name: string | null; image: string | null }
  >();
  if (guestEmails.length > 0) {
    const matched = await prisma.user.findMany({
      where: {
        email: { in: guestEmails },
        memberships: { some: { tenantId } },
      },
      select: { id: true, email: true, name: true, image: true },
    });
    for (const u of matched) {
      if (u.email) emailToUser.set(u.email.toLowerCase(), u);
    }
  }

  const attendees: FeedAttendee[] = [];
  const seenUserIds = new Set<string>();

  for (const b of bookings) {
    if (b.userId) {
      if (seenUserIds.has(b.userId)) continue;
      seenUserIds.add(b.userId);
      attendees.push({
        id: b.userId,
        name: b.user?.name ?? "Miembro",
        image: b.user?.image ?? null,
        isGuest: false,
      });
      continue;
    }

    // Guest / platform booking — nothing to display if it has no identity.
    if (!b.guestName && !b.guestEmail) continue;

    const linked = b.guestEmail
      ? emailToUser.get(b.guestEmail.toLowerCase())
      : undefined;
    if (linked) {
      if (seenUserIds.has(linked.id)) continue;
      seenUserIds.add(linked.id);
      attendees.push({
        id: linked.id,
        name: linked.name ?? b.guestName ?? "Invitado",
        image: linked.image ?? null,
        isGuest: false,
      });
    } else {
      attendees.push({
        id: `guest:${b.id}`,
        name: b.guestName ?? "Invitado",
        image: null,
        isGuest: true,
      });
    }
  }

  return attendees;
}

/**
 * Append any guest/platform (Wellhub, Gympass) attendees that are missing from
 * a class's existing CLASS_COMPLETED feed post. Additive + idempotent: keeps
 * the members already listed and only adds not-yet-present, not-cancelled,
 * not-no-show guest bookings. No-op if the class has no completed post yet
 * (the completion path will include them when it creates the post).
 *
 * Used to catch platform check-ins that land *after* the post was created
 * (e.g. a Wellhub member who checks in a few minutes after the cron already
 * auto-completed the class), so no manual backfill is ever needed.
 *
 * Returns the number of attendees appended.
 */
export async function syncCompletedClassAttendees(
  classId: string,
  tenantId: string,
): Promise<number> {
  const event = await prisma.feedEvent.findFirst({
    where: {
      tenantId,
      eventType: "CLASS_COMPLETED",
      payload: { path: ["classId"], equals: classId },
    },
    select: { id: true, payload: true },
  });
  if (!event) return 0;

  const payload = (event.payload as Record<string, unknown>) ?? {};
  const prev = (payload.attendees as { id: string }[]) ?? [];
  const prevIds = new Set(prev.map((a) => a.id));

  const guestBookings = await prisma.booking.findMany({
    where: {
      classId,
      userId: null,
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
    },
    include: { user: { select: { id: true, name: true, image: true } } },
  });
  if (guestBookings.length === 0) return 0;

  const guests = await buildClassAttendees(guestBookings, tenantId);
  const toAppend = guests.filter((a) => !prevIds.has(a.id));
  if (toAppend.length === 0) return 0;

  const attendees = [...prev, ...toAppend];
  await prisma.feedEvent.update({
    where: { id: event.id },
    data: { payload: { ...payload, attendees, attendeeCount: attendees.length } },
  });
  return toAppend.length;
}
