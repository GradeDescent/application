-- Add partial indexes for runnable steps and lease reaping
CREATE INDEX pipeline_steps_runnable_idx
  ON "PipelineStep" ("runAt", "priority", "id")
  WHERE "status" = 'QUEUED';

CREATE INDEX pipeline_steps_running_lease_idx
  ON "PipelineStep" ("lockedUntil")
  WHERE "status" = 'RUNNING';
