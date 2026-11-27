PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;
CREATE TABLE "CollectionVersions" (
    "Id" INTEGER PRIMARY KEY,
    "CollectionItemId" INTEGER NOT NULL REFERENCES "Collection"("Id") ON DELETE CASCADE,
    "MediaFormat" INTEGER,
    "Platform" INTEGER,
    "Store" INTEGER,
    "IsPhysical" INTEGER CHECK ("IsPhysical" IN (0,1)),
    "IsCompleteBox" INTEGER NOT NULL DEFAULT 0 CHECK ("IsCompleteBox" IN (0,1)),
    "OwnedSeasonsJson" TEXT NOT NULL DEFAULT '[]',
    "Info" TEXT,
    "CreatedAt" TEXT,
    "UpdatedAt" TEXT
);
CREATE INDEX "IX_CollectionVersions_Item" ON "CollectionVersions"("CollectionItemId");
COMMIT;
