-- Deduplicate existing course codes before adding unique constraint
WITH ranked AS (
    SELECT "id",
           "code",
           ROW_NUMBER() OVER (PARTITION BY "code" ORDER BY "id") AS rn
    FROM "Course"
    WHERE "code" IS NOT NULL
)
UPDATE "Course" c
SET "code" = c."code" || '-' || substr(md5(c."id"), 1, 4)
FROM ranked r
WHERE c."id" = r."id"
  AND r.rn > 1;

-- CreateIndex
CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");
