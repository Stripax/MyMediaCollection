PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;
CREATE TABLE "VersionHistory" (
    "Id" INTEGER PRIMARY KEY,
    "VersionNumber" TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim("VersionNumber")) BETWEEN 1 AND 64),
    "Description" TEXT NOT NULL CHECK (length(trim("Description")) BETWEEN 1 AND 20000),
    "CreatedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    "UserId" TEXT
);
COMMIT;
