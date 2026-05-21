-- Song request rules: replace flat criteria array with structured JSON rules
--
-- Old shape: Class.songRequestCriteria text[]  (e.g. ['ALL'] | ['BIRTHDAY_WEEK','FIRST_CLASS'])
-- New shape: Class.songRequestRules    jsonb   (e.g. [{"type":"ALL"}]
--                                              | [{"type":"LEVEL_AT_LEAST","levelId":"..."}]
--                                              | [{"type":"SUBSCRIPTION","packageIds":["..."]}])
--
-- Existing values are mapped 1:1 to {"type": <value>} objects. Rows with
-- an empty array (song requests disabled) collapse to the ALL default —
-- songRequestsEnabled still gates the feature so this is harmless.

ALTER TABLE "Class"
    ADD COLUMN "songRequestRules" JSONB NOT NULL DEFAULT '[{"type":"ALL"}]'::jsonb;

UPDATE "Class" c
SET "songRequestRules" = COALESCE(
    (
        SELECT jsonb_agg(jsonb_build_object('type', val))
        FROM unnest(c."songRequestCriteria") AS val
        WHERE val IN ('ALL','BIRTHDAY_WEEK','ANNIVERSARY','FIRST_CLASS','CLASS_MILESTONE')
    ),
    '[{"type":"ALL"}]'::jsonb
);

ALTER TABLE "Class" DROP COLUMN "songRequestCriteria";
