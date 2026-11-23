-- Run once after 003-add-item-metadata.sql. Manual items remain unlinked.
PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;
CREATE TABLE "TmdbMetadata" (
    "Id" INTEGER PRIMARY KEY,
    "TmdbId" INTEGER NOT NULL CHECK ("TmdbId" > 0),
    "MediaType" INTEGER NOT NULL CHECK ("MediaType" IN (1, 2)),
    "Language" TEXT NOT NULL,
    "Title" TEXT NOT NULL,
    "OriginalTitle" TEXT NOT NULL,
    "Overview" TEXT NOT NULL,
    "ReleaseDate" TEXT,
    "PosterPath" TEXT,
    "FetchedAt" TEXT NOT NULL,
    UNIQUE ("TmdbId", "MediaType", "Language")
);
ALTER TABLE "Collection" ADD COLUMN "TmdbMetadataId" INTEGER REFERENCES "TmdbMetadata"("Id") ON DELETE SET NULL;
CREATE INDEX "IX_Collection_TmdbMetadataId" ON "Collection" ("TmdbMetadataId");
COMMIT;
