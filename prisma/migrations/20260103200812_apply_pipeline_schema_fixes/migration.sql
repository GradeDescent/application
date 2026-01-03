/*
  Warnings:

  - A unique constraint covering the columns `[courseId,pipeline,idempotencyKey]` on the table `PipelineRun` will be added. If there are existing duplicate values, this will fail.

*/
DROP INDEX IF EXISTS "PipelineRun_courseId_pipeline_idempotencyKey_key";

-- CreateIndex
CREATE UNIQUE INDEX "PipelineRun_courseId_pipeline_idempotencyKey_key" ON "PipelineRun"("courseId", "pipeline", "idempotencyKey");
