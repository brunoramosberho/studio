// Wellhub sandbox helper endpoints — only available against
// apitesting.partners.gympass.com. Lets us trigger real webhooks against our
// own endpoints without needing a live Wellhub member.
//
// Reference: Postman "Webhook Simulations" folder
//   POST /helper/v1/gyms/{gym_id}/simulate/bookings
//   POST /helper/v1/gyms/{gym_id}/simulate/bookings/{booking_number}/cancel
//   POST /helper/v1/gyms/{gym_id}/simulate/checkins
//
// All endpoints return the same shape as the actual webhook payload so we can
// confirm our handler would receive the expected event_data.

import { bookingApi, getWellhubEnv } from "./client";
import { WellhubConfigError } from "./errors";
import type {
  WellhubBookingCanceledEvent,
  WellhubBookingLateCanceledEvent,
  WellhubBookingRequestedEvent,
  WellhubCheckinEvent,
} from "./types";

function assertSandbox() {
  if (getWellhubEnv() !== "sandbox") {
    throw new WellhubConfigError(
      "Wellhub webhook simulations are only available in sandbox (WELLHUB_ENV !== 'production').",
    );
  }
}

export interface SimulateBookingArgs {
  gymId: number;
  slotId: number;
  classId: number;
  /** 13-digit user id from Wellhub's sandbox catalog. */
  gympassUserId: string;
  token: string;
}

export async function simulateBookingRequested(
  args: SimulateBookingArgs,
): Promise<WellhubBookingRequestedEvent> {
  assertSandbox();
  return bookingApi<WellhubBookingRequestedEvent>(
    `/helper/v1/gyms/${args.gymId}/simulate/bookings`,
    {
      method: "POST",
      token: args.token,
      body: {
        gympass_user_id: args.gympassUserId,
        slot_id: args.slotId,
        class_id: args.classId,
      },
    },
  );
}

export interface SimulateCancelArgs {
  gymId: number;
  bookingNumber: string;
  late?: boolean;
  token: string;
}

export async function simulateBookingCancel(
  args: SimulateCancelArgs,
): Promise<WellhubBookingCanceledEvent | WellhubBookingLateCanceledEvent> {
  assertSandbox();
  return bookingApi<WellhubBookingCanceledEvent | WellhubBookingLateCanceledEvent>(
    `/helper/v1/gyms/${args.gymId}/simulate/bookings/${args.bookingNumber}/cancel`,
    {
      method: "POST",
      token: args.token,
      body: args.late ? { late: true } : {},
    },
  );
}

export interface SimulateCheckinArgs {
  gymId: number;
  gympassUserId: string;
  token: string;
}

export async function simulateCheckin(
  args: SimulateCheckinArgs,
): Promise<WellhubCheckinEvent> {
  assertSandbox();
  return bookingApi<WellhubCheckinEvent>(
    `/helper/v1/gyms/${args.gymId}/simulate/checkins`,
    {
      method: "POST",
      token: args.token,
      body: { gympass_user_id: args.gympassUserId },
    },
  );
}
