-- Add enum for pipeline artifact direction
CREATE TYPE "PipelineArtifactDirection" AS ENUM ('INPUT', 'OUTPUT');

ALTER TABLE "PipelineStepArtifact"
  ALTER COLUMN "direction" TYPE "PipelineArtifactDirection"
  USING "direction"::"PipelineArtifactDirection";
