-- Run once after 006-add-physical-copy.sql. Preserve manual and renamed items.
BEGIN TRANSACTION;
ALTER TABLE "Collection" ADD COLUMN "IsNameCustom" INTEGER NOT NULL DEFAULT 1 CHECK ("IsNameCustom" IN (0, 1));
UPDATE "Collection" SET "IsNameCustom" = 0
WHERE "MediaType" IN (1, 2) AND EXISTS (
    SELECT 1 FROM "TmdbMetadata" m
    WHERE m."Id" = "Collection"."TmdbMetadataId" AND m."Title" = "Collection"."Name"
);
COMMIT;
