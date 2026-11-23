-- Run once after 002-add-store.sql. Unknown historical values remain NULL.
BEGIN TRANSACTION;
ALTER TABLE "Collection" ADD COLUMN "CreatedAt" TEXT;
ALTER TABLE "Collection" ADD COLUMN "UpdatedAt" TEXT;
ALTER TABLE "Collection" ADD COLUMN "UserId" TEXT;
COMMIT;
