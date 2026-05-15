-- Extend PlatformType enum to cover Totalpass and Fitpass. The booking flows
-- for these partners are not yet integrated, but historical reservations
-- need to be recorded so dashboards reflect true provenance.
ALTER TYPE "PlatformType" ADD VALUE IF NOT EXISTS 'totalpass';
ALTER TYPE "PlatformType" ADD VALUE IF NOT EXISTS 'fitpass';
