BEGIN TRANSACTION;
ALTER TABLE "Collection" ADD COLUMN "BoardGameKind" INTEGER CHECK ("BoardGameKind" IN (1, 2, 99));
ALTER TABLE "Collection" ADD COLUMN "BaseGamesJson" TEXT;
-- NULL keeps provider defaults available for older imported games.
UPDATE "Collection" SET "BoardGameKind" = 1 WHERE "MediaType" = 4 AND "BggMetadataId" IS NULL;
COMMIT;
