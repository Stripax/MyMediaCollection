-- Run once after 007-add-custom-name.sql. Existing ownership is not inferred.
PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;
ALTER TABLE "TmdbMetadata" ADD COLUMN "NumberOfSeasons" INTEGER CHECK ("NumberOfSeasons" >= 0);
ALTER TABLE "TmdbMetadata" ADD COLUMN "NumberOfEpisodes" INTEGER CHECK ("NumberOfEpisodes" >= 0);
ALTER TABLE "TmdbMetadata" ADD COLUMN "SeasonsJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Collection" ADD COLUMN "IsCompleteBox" INTEGER NOT NULL DEFAULT 0 CHECK ("IsCompleteBox" IN (0, 1));
CREATE TABLE "CollectionSeasons" (
    "CollectionItemId" INTEGER NOT NULL REFERENCES "Collection"("Id") ON DELETE CASCADE,
    "SeasonNumber" INTEGER NOT NULL CHECK ("SeasonNumber" BETWEEN 1 AND 1000),
    "MediaFormat" INTEGER NOT NULL CHECK ("MediaFormat" IN (1, 2, 3, 99)),
    PRIMARY KEY ("CollectionItemId", "SeasonNumber")
);
COMMIT;
