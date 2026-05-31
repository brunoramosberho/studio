-- Wellhub per-partner credentials.
--
-- Rafa (Wellhub CTO) confirmed there is no CMS-level integration model: each
-- studio is a direct partner with its own bearer token. We now store that
-- token per-tenant (encrypted via lib/encryption.ts) on StudioPlatformConfig.
--
-- Also drops the gate_trigger implementation method — Wellhub's Postman docs
-- explicitly state "Check-ins must be done through the Wellhub app for all
-- visits by subscribers", so the only supported flow is attendance_trigger.

-- ── Per-tenant Wellhub auth token ───────────────────────────────────────

ALTER TABLE "StudioPlatformConfig"
    ADD COLUMN "wellhubAuthToken" TEXT;

-- ── Drop unused implementation method ───────────────────────────────────

ALTER TABLE "StudioPlatformConfig"
    DROP COLUMN "wellhubImplMethod";

DROP TYPE "WellhubImplementationMethod";
