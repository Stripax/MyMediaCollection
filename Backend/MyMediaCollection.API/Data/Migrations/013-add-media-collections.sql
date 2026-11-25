PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;
ALTER TABLE "Collection" ADD COLUMN "IsCollection" INTEGER NOT NULL DEFAULT 0 CHECK ("IsCollection" IN (0,1));
CREATE TABLE "CollectionContents" (
    "CollectionItemId" INTEGER NOT NULL REFERENCES "Collection"("Id") ON DELETE CASCADE,
    "Position" INTEGER NOT NULL CHECK ("Position" >= 0),
    "Name" TEXT NOT NULL,
    "TmdbMetadataId" INTEGER REFERENCES "TmdbMetadata"("Id") ON DELETE SET NULL,
    PRIMARY KEY ("CollectionItemId", "Position")
);
COMMIT;
