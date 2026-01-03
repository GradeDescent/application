-- Replace full unique indexes with partial unique (non-null idempotency keys)
DROP INDEX IF EXISTS "PipelineRun_courseId_pipeline_idempotencyKey_key";
DROP INDEX IF EXISTS "LedgerEntry_accountId_idempotencyKey_key";

CREATE UNIQUE INDEX pipeline_runs_idem
  ON "PipelineRun" ("courseId", "pipeline", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

CREATE UNIQUE INDEX ledger_entries_idem
  ON "LedgerEntry" ("accountId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
