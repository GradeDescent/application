-- Backfill missing course codes before enforcing NOT NULL
UPDATE "Course"
SET "code" = 'legacy-' || substr(md5("id"), 1, 8)
WHERE "code" IS NULL;

-- AlterTable
ALTER TABLE "Course" ALTER COLUMN "code" SET NOT NULL;
