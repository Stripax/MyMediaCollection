-- Run once after 004-add-tmdb-metadata.sql. Existing items remain unchanged.
PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;
CREATE TABLE "IgdbMetadata" (
    "Id" INTEGER PRIMARY KEY,
    "IgdbId" INTEGER NOT NULL UNIQUE CHECK ("IgdbId" > 0),
    "Title" TEXT NOT NULL,
    "Overview" TEXT NOT NULL,
    "ReleaseDate" TEXT,
    "CoverImageId" TEXT,
    "PlatformsJson" TEXT NOT NULL,
    "FetchedAt" TEXT NOT NULL
);
ALTER TABLE "Collection" ADD COLUMN "IgdbMetadataId" INTEGER REFERENCES "IgdbMetadata"("Id") ON DELETE SET NULL;
CREATE INDEX "IX_Collection_IgdbMetadataId" ON "Collection" ("IgdbMetadataId");
COMMIT;
