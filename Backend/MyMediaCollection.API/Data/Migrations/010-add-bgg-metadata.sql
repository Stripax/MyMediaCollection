PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;
CREATE TABLE "BggMetadata" (
    "Id" INTEGER PRIMARY KEY,
    "BggId" INTEGER NOT NULL UNIQUE CHECK ("BggId" > 0),
    "Title" TEXT NOT NULL,
    "Overview" TEXT NOT NULL,
    "YearPublished" INTEGER,
    "ImageUrl" TEXT,
    "MinPlayers" INTEGER,
    "MaxPlayers" INTEGER,
    "PlayingTime" INTEGER,
    "MinAge" INTEGER,
    "FetchedAt" TEXT NOT NULL
);
ALTER TABLE "Collection" ADD COLUMN "BggMetadataId" INTEGER REFERENCES "BggMetadata"("Id") ON DELETE SET NULL;
CREATE INDEX "IX_Collection_BggMetadataId" ON "Collection" ("BggMetadataId");
COMMIT;
