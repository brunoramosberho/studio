// TypeScript bindings for the Wellhub Booking, Access Control, and Integration
// Setup APIs. Field names are kept snake_case to match the wire format.

// ─── Booking API: Classes ─────────────────────────────────────────────────

export interface WellhubCategory {
  id: number;
  name: string;
  locale: string;
}

export interface WellhubClass {
  id: number;
  name: string;
  slug?: string;
  description: string;
  notes?: string | null;
  bookable: boolean;
  visible: boolean;
  product_id: number;
  gym_id?: number;
  reference?: string | null;
  created_at?: string;
  categories?: WellhubCategory[];
}

export interface WellhubClassCreatePayload {
  name: string;
  description: string;
  notes?: string;
  bookable: boolean;
  visible: boolean;
  product_id: number;
  reference?: string;
  system_id?: number;
  categories?: number[];
}

export interface WellhubClassUpdatePayload {
  name: string;
  description: string;
  notes?: string;
  bookable: boolean;
  visible: boolean;
  product_id: number;
  reference?: string;
  categories?: number[];
}

export interface WellhubClassCreateResponse {
  classes: Array<{
    id: number;
    name: string;
    reference?: string | null;
    links?: Array<{ rel: string; href: string }>;
  }>;
}

export interface WellhubClassListResponse {
  classes: WellhubClass[];
}

// ─── Booking API: Slots ───────────────────────────────────────────────────

export interface WellhubInstructor {
  name: string;
  substitute: boolean;
}

export interface WellhubBookingWindow {
  opens_at?: string | null;
  closes_at?: string | null;
}

export interface WellhubSlot {
  id: number;
  class_id: number;
  occur_date: string;
  status: 0 | 1;
  room?: string | null;
  length_in_minutes: number;
  total_capacity: number;
  total_booked: number;
  product_id: number;
  booking_window?: WellhubBookingWindow;
  cancellable_until?: string | null;
  instructors?: WellhubInstructor[];
  rating?: number;
  virtual?: boolean;
  virtual_class_url?: string | null;
}

export interface WellhubSlotCreatePayload {
  occur_date: string;
  room?: string;
  status?: 0 | 1;
  length_in_minutes: number;
  total_capacity: number;
  total_booked: number;
  product_id: number;
  booking_window?: WellhubBookingWindow;
  cancellable_until?: string;
  instructors?: WellhubInstructor[];
  rating?: number;
  virtual?: boolean;
  virtual_class_url?: string;
}

export type WellhubSlotUpdatePayload = WellhubSlotCreatePayload;

export interface WellhubSlotPatchPayload {
  total_capacity?: number;
  total_booked?: number;
  virtual_class_url?: string;
}

export interface WellhubSlotEnvelope<T> {
  metadata: { total: number; errors: number };
  results: T[];
}

export interface WellhubSlotListResponse {
  metadata: { page: number; page_size: number; total_elements: number; total: number; errors: number };
  results: WellhubSlot[];
}

// ─── Booking API: Products ────────────────────────────────────────────────

export interface WellhubProduct {
  product_id: number;
  name: string;
  virtual: boolean;
  updated_at: string;
}

export interface WellhubProductsResponse {
  gym_id: number;
  products: WellhubProduct[];
}

// ─── Booking API: Categories ──────────────────────────────────────────────

export interface WellhubCategoriesResponse {
  metadata: { total: number; errors: number };
  results: WellhubCategory[];
}

export type WellhubLocale =
  | "de" | "en" | "en_GB" | "es" | "fr" | "it" | "nl" | "pt" | "pt_PT"
  | "en_IE" | "es_AR" | "es_CL" | "es_MX" | "es_UY";

// ─── Booking API: Bookings (PATCH /booking/v2) ────────────────────────────

export type WellhubBookingStatus = "RESERVED" | "REJECTED" | "CANCELLED_BY_GYM";

export type WellhubBookingRejectionReason =
  | "CLASS_IS_FULL"
  | "USAGE_RESTRICTION"
  | "USER_IS_ALREADY_BOOKED"
  | "SPOT_NOT_AVAILABLE"
  | "USER_DOES_NOT_EXIST"
  | "CHECK_IN_AND_CANCELATION_WINDOWS_CLOSED"
  | "CLASS_HAS_BEEN_CANCELED"
  | "CLASS_NOT_FOUND"
  | "USER_PROFILE_CMS"
  | "PREREQUISITES"
  | "GENERAL_ERROR"
  | "TECHNICAL_ERROR";

export interface WellhubBookingPatchPayload {
  status: WellhubBookingStatus;
  reason?: string;
  reason_category?: WellhubBookingRejectionReason;
  virtual_class_url?: string;
}

// ─── Webhook events ───────────────────────────────────────────────────────

export interface WellhubBookingRequestedEvent {
  event_type: "booking-requested";
  event_data: {
    user: { unique_token: string; name?: string; email?: string };
    slot: { id: number; gym_id: number; class_id: number; booking_number: string };
    timestamp: number;
    event_id: string;
  };
}

export interface WellhubBookingCanceledEvent {
  event_type: "booking-canceled";
  event_data: {
    user: { unique_token: string };
    slot: { id: number; gym_id: number; class_id: number; booking_number: string };
    timestamp: number;
    event_id: string;
  };
}

export interface WellhubBookingLateCanceledEvent {
  event_type: "booking-late-canceled";
  event_data: {
    user: { unique_token: string };
    slot: { id: number; gym_id: number; class_id: number; booking_number: string };
    timestamp: number;
    event_id: string;
  };
}

export interface WellhubCheckinBookingOccurredEvent {
  event_type: "checkin-booking-occurred";
  event_data: {
    booking: { booking_number: string };
    user: { unique_token: string };
    location?: { lat: number; lon: number };
    gym: {
      id: number;
      title: string;
      product: { description: string; pass_type_number: number };
    };
    timestamp: number;
    expires_at?: number;
  };
}

export interface WellhubCheckinEvent {
  event_type: "checkin";
  event_data: {
    user: {
      unique_token: string;
      first_name?: string;
      last_name?: string;
      email?: string;
      phone_number?: string;
    };
    location?: { lat: number; lon: number };
    gym: {
      id: number;
      title: string;
      product: { id: number; description: string };
    };
    timestamp: number;
  };
}

export interface WellhubSystemIntegrationRequestedEvent {
  event_type: "system-integration-requested";
  event_data: {
    gym_id: number;
    gym_name: string;
    partner_id: string;
    custom_fields?: Array<{ key: string; value: string }>;
    event_id: string;
    timestamp: number;
  };
}

export type WellhubWebhookEvent =
  | WellhubBookingRequestedEvent
  | WellhubBookingCanceledEvent
  | WellhubBookingLateCanceledEvent
  | WellhubCheckinBookingOccurredEvent
  | WellhubCheckinEvent
  | WellhubSystemIntegrationRequestedEvent;

export type WellhubWebhookEventType = WellhubWebhookEvent["event_type"];

// ─── Access Control API ───────────────────────────────────────────────────

export interface WellhubValidateRequest {
  gympass_id: string;
  custom_code?: string;
}

export interface WellhubValidateResponse {
  metadata: { total: number; errors: number };
  results: {
    user: { gympass_id: string };
    gym: { Id: number; product: { Id: number; description: string } };
    validated_at: string;
  };
}

export interface WellhubCustomCodeRequest {
  custom_code: string;
}

// ─── Integration Setup API ────────────────────────────────────────────────

export interface WellhubSetupGymsListResponse {
  partners: Array<{ id: number; enabled: boolean }>;
}

export interface WellhubSetupWebhookSubscription {
  event: Exclude<WellhubWebhookEventType, "system-integration-requested">;
  url: string;
  secret: string;
  additional_data?: boolean;
  internal_product?: boolean | null;
}

export interface WellhubSetupWebhookListResponse {
  webhooks: WellhubSetupWebhookSubscription[];
}

export interface WellhubSetupSystemNotificationSubscribeRequest {
  type: "SYSTEM_INTEGRATION_REQUESTED";
  url: string;
  secret: string;
}
