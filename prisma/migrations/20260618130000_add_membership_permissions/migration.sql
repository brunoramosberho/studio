-- Per-membership admin permission override. NULL = use the role's default
-- permission set; a JSON array of AdminPermission strings is the explicit
-- allow-list for that membership.
ALTER TABLE "Membership" ADD COLUMN "permissions" JSONB;
