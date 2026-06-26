// Public surface for the Wellhub integration.
//
// Import paths:
//   - High-level handlers (called from webhook routes / crons / admin actions):
//       processBookingRequested, processBookingCanceled,
//       processCheckinBookingOccurred, processCheckinWebhook
//   - Low-level resource clients (called from sync hooks):
//       createWellhubClass, updateWellhubClass, hideWellhubClass,
//       createWellhubSlot, updateWellhubSlot, patchWellhubSlot,
//       deleteWellhubSlot, listWellhubSlots
//   - Pure helpers (no I/O — safe to import from anywhere):
//       computeSignature, verifySignature, classToWellhubSlotPayload, …

export { WellhubApiError, WellhubConfigError } from "./errors";

export {
  bookingApi,
  accessApi,
  bookingHealth,
  verifyGymAccess,
  getWellhubEnv,
  getWellhubTokenForTenant,
  getBookingBaseUrl,
  getAccessBaseUrl,
} from "./client";

export { computeSignature, verifySignature, SIGNATURE_HEADER } from "./webhooks";

export {
  classTypeToWellhubCreatePayload,
  classTypeToWellhubUpdatePayload,
  classToWellhubSlotPayload,
  capacityPatchPayload,
} from "./mapping";
export type {
  MagicClassForSync,
  MagicClassTypeForSync,
  MagicInstructorForSync,
} from "./mapping";

export {
  createWellhubClass,
  updateWellhubClass,
  hideWellhubClass,
  listWellhubClasses,
  getWellhubClass,
} from "./classes";

export {
  createWellhubSlot,
  updateWellhubSlot,
  patchWellhubSlot,
  deleteWellhubSlot,
  getWellhubSlot,
  listWellhubSlots,
} from "./slots";

export { fetchWellhubProducts, refreshWellhubProducts } from "./products";

export { listWellhubCategories } from "./categories";

export {
  patchWellhubBooking,
  processBookingRequested,
  processBookingCanceled,
  processCheckinBookingOccurred,
  cascadeFreedSeat,
  syncCompanionStatus,
} from "./bookings";

export {
  validateWellhubCheckin,
  createWellhubCustomCode,
  updateWellhubCustomCode,
  deleteWellhubCustomCode,
  processCheckinWebhook,
  validateWellhubVisitForCheckin,
} from "./access-control";

export {
  resolveTenantByWellhubGymId,
  requireTenantByWellhubGymId,
} from "./resolve";

export { verifyAndParseGymWebhook } from "./webhook-handler";
export type {
  WellhubWebhookFailure,
  WellhubWebhookSuccess,
} from "./webhook-handler";

export {
  syncClassToWellhub,
  unsyncClassFromWellhub,
  hideClassTypeInWellhub,
  patchWellhubCapacityForClass,
  applyWellhubQuotaToClass,
} from "./sync";
export type { WellhubSyncResult } from "./sync";

export {
  tryLinkWellhubUserToMagic,
  tryLinkMagicUserToWellhub,
} from "./matching";
export type { LinkReason } from "./matching";

export {
  simulateBookingRequested,
  simulateBookingCancel,
  simulateCheckin,
} from "./simulations";
export type {
  SimulateBookingArgs,
  SimulateCancelArgs,
  SimulateCheckinArgs,
} from "./simulations";

export type {
  WellhubBookingPatchPayload,
  WellhubBookingRejectionReason,
  WellhubBookingStatus,
  WellhubBookingRequestedEvent,
  WellhubBookingCanceledEvent,
  WellhubBookingLateCanceledEvent,
  WellhubCheckinBookingOccurredEvent,
  WellhubCheckinEvent,
  WellhubCategory,
  WellhubClass,
  WellhubClassCreatePayload,
  WellhubLocale,
  WellhubProduct,
  WellhubSlot,
  WellhubSlotCreatePayload,
  WellhubSlotPatchPayload,
  WellhubSlotUpdatePayload,
  WellhubWebhookEvent,
  WellhubWebhookEventType,
} from "./types";
