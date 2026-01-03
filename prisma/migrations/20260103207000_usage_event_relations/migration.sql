-- Add foreign keys for usage event links
ALTER TABLE "UsageEvent"
  ADD CONSTRAINT "UsageEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UsageEvent"
  ADD CONSTRAINT "UsageEvent_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UsageEvent"
  ADD CONSTRAINT "UsageEvent_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UsageEvent"
  ADD CONSTRAINT "UsageEvent_pipelineRunId_fkey" FOREIGN KEY ("pipelineRunId") REFERENCES "PipelineRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UsageEvent"
  ADD CONSTRAINT "UsageEvent_pipelineStepId_fkey" FOREIGN KEY ("pipelineStepId") REFERENCES "PipelineStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
