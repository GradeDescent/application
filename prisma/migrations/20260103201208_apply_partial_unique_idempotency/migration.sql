-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_idempotencyKey_idx" ON "LedgerEntry"("accountId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PipelineRun_courseId_pipeline_idempotencyKey_idx" ON "PipelineRun"("courseId", "pipeline", "idempotencyKey");
