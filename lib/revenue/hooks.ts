// Thin wrappers that call the recognition service but never surface failures
// to the booking/payment flows that invoke them. Revenue recognition is best-
// effort: a transient DB error here must not break user-facing bookings.
//
// Idempotency notes:
//   - RevenueEvent has @@unique(entitlementId, eventDate, type), so replays
//     are no-ops. Safe to call multiple times.
//   - ensureEntitlementForUserPackage is idempotent via Entitlement.userPackageId.
//   - Known limitation (v1 schema): when a single pack entitlement funds
//     multiple bookings on the same day (e.g. a booking + its guest bookings
//     against one class, or two classes booked on the same calendar day), only
//     the first emits a RevenueEvent; the unique index silently deduplicates
//     the rest. Monthly reconciliation still ties out at the entitlement
//     level; per-class attribution undercounts these edge cases.

import {
  recognizePackBooking,
  recognizePenalty,
} from "./service";

interface LogContext {
  scope: string;
  bookingId?: string;
  userPackageId?: string;
  classId?: string;
}

function logRecognitionError(err: unknown, ctx: LogContext) {
  console.error(
    `[revenue:${ctx.scope}] recognition failed`,
    {
      bookingId: ctx.bookingId,
      userPackageId: ctx.userPackageId,
      classId: ctx.classId,
      error: err instanceof Error ? err.message : String(err),
    },
  );
}

/**
 * Recognize revenue for a booking funded by a UserPackage. Covers both pack
 * and drop-in-as-pack flows (book-and-pay creates a 1-credit UserPackage for
 * walk-in purchases; recognition still routes through here).
 *
 * For unlimited subscription-backed bookings, the authoritative amount is
 * computed at monthly close — this call silently resolves but emits no
 * booking revenue event (the `recognizePackBooking` implementation checks
 * the entitlement type and throws on unlimited). We guard and skip.
 */
export async function recognizeBookingSafe(params: {
  userPackageId: string;
  bookingId: string;
  classId: string;
  scheduledAt: Date;
  scope: string;
}): Promise<void> {
  try {
    await recognizePackBooking({
      userPackageId: params.userPackageId,
      bookingId: params.bookingId,
      classId: params.classId,
      scheduledAt: params.scheduledAt,
    });
  } catch (err) {
    // `recognizePackBooking` throws when the Entitlement is unlimited: that's
    // an expected skip (unlimited bookings are recognized at monthly close
    // via Booking.sourceEntitlementId linkage). Detect and swallow quietly.
    if (err instanceof Error && /is not a pack/.test(err.message)) {
      return;
    }
    logRecognitionError(err, {
      scope: params.scope,
      bookingId: params.bookingId,
      userPackageId: params.userPackageId,
      classId: params.classId,
    });
  }
}

/**
 * Recognize a no-show / late-cancel penalty as revenue. Called right after
 * the booking flow marks `noShowFeeApplied`. Fee amount comes from the
 * tenant's configured `noShowPenaltyAmount`.
 */
export async function recognizePenaltySafe(params: {
  tenantId: string;
  userId: string;
  classId: string;
  amountCents: number;
  chargedAt: Date;
  currency?: string;
}): Promise<void> {
  try {
    await recognizePenalty(params);
  } catch (err) {
    logRecognitionError(err, {
      scope: "penalty",
      classId: params.classId,
    });
  }
}
