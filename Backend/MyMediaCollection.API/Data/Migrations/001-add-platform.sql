-- Run once on an existing Collection table. Existing rows keep Platform = NULL.
ALTER TABLE "Collection" ADD COLUMN "Platform" INTEGER;
