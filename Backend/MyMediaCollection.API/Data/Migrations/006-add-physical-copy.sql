-- Run once after 005-add-igdb-metadata.sql. Historical copy types stay unknown.
ALTER TABLE "Collection" ADD COLUMN "IsPhysical" INTEGER CHECK ("IsPhysical" IS NULL OR "IsPhysical" IN (0, 1));
