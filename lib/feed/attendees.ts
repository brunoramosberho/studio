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
