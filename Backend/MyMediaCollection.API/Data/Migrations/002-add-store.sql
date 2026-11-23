-- Run once after 001-add-platform.sql. Existing rows keep Store = NULL.
ALTER TABLE "Collection" ADD COLUMN "Store" INTEGER;
