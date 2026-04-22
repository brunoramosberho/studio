// Shared types for the revenue recognition module.
//
// All amounts live here as integer cents to keep accounting-grade precision
// independent of the Float-based money fields used elsewhere in the repo.
// Conversion happens at the boundary (service callers / API responses).

export type Cents = number;

export interface BookingForAllocation {
  id: string;
  classId: string;
  scheduledAt: Date;
  weight: number; // ClassType.revenueWeight snapshot-eligible value
  dropInPriceCents: Cents | null;
}

export interface AllocationResult {
  bookingId: string;
  amountCents: Cents;
  weight: number;
  rawCents: Cents;
  wasCapped: boolean;
}

export interface MonthlyCloseAllocation {
  entitlementId: string;
  monthlyBucketCents: Cents;
  allocations: AllocationResult[];
  monthlyBreakageCents: Cents;
}
