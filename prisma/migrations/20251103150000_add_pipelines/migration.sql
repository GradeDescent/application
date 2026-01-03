-- CreateEnum
CREATE TYPE "PipelineName" AS ENUM ('ASSIGNMENT_PROCESS', 'SUBMISSION_PROCESS');

-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PipelineStepStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'CANCELED');

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "pipeline" "PipelineName" NOT NULL,
    "courseId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "submissionId" TEXT,
    "evaluationId" TEXT,
    "status" "PipelineStatus" NOT NULL,
    "createdByUserId" TEXT,
    "createdByService" TEXT,
    "idempotencyKey" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PipelineStepStatus" NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStepArtifact" (
    "stepId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,

    CONSTRAINT "PipelineStepArtifact_pkey" PRIMARY KEY ("stepId", "artifactId", "direction")
);

-- CreateTable
CREATE TABLE "PipelineStepEvent" (
    "id" SERIAL NOT NULL,
    "stepId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineStepEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentProblem" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "problemIndex" INTEGER NOT NULL,
    "title" TEXT,
    "maxPoints" INTEGER,
    "promptTex" TEXT,
    "rubric" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssignmentProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionProblem" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "problemIndex" INTEGER NOT NULL,
    "sourceTex" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmissionProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemEvaluation" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "submissionProblemId" TEXT NOT NULL,
    "assignmentProblemId" TEXT,
    "score" DOUBLE PRECISION,
    "evaluationJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentProblem_assignmentId_problemIndex_key" ON "AssignmentProblem"("assignmentId", "problemIndex");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionProblem_submissionId_problemIndex_key" ON "SubmissionProblem"("submissionId", "problemIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ProblemEvaluation_evaluationId_submissionProblemId_key" ON "ProblemEvaluation"("evaluationId", "submissionProblemId");

-- CreateIndex
CREATE INDEX "PipelineRun_submissionId_createdAt_idx" ON "PipelineRun"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "PipelineRun_assignmentId_createdAt_idx" ON "PipelineRun"("assignmentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineRun_courseId_pipeline_idempotencyKey_key" ON "PipelineRun"("courseId", "pipeline", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

-- CreateIndex
CREATE INDEX "PipelineStep_runAt_priority_id_idx" ON "PipelineStep"("runAt", "priority", "id");

-- CreateIndex
CREATE INDEX "PipelineStep_lockedUntil_idx" ON "PipelineStep"("lockedUntil");

-- CreateIndex
CREATE INDEX "PipelineStep_runId_status_idx" ON "PipelineStep"("runId", "status");

-- CreateIndex
CREATE INDEX "PipelineStepEvent_stepId_id_idx" ON "PipelineStepEvent"("stepId", "id");

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStep" ADD CONSTRAINT "PipelineStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PipelineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStepArtifact" ADD CONSTRAINT "PipelineStepArtifact_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "PipelineStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStepArtifact" ADD CONSTRAINT "PipelineStepArtifact_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStepEvent" ADD CONSTRAINT "PipelineStepEvent_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "PipelineStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentProblem" ADD CONSTRAINT "AssignmentProblem_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionProblem" ADD CONSTRAINT "SubmissionProblem_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemEvaluation" ADD CONSTRAINT "ProblemEvaluation_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemEvaluation" ADD CONSTRAINT "ProblemEvaluation_submissionProblemId_fkey" FOREIGN KEY ("submissionProblemId") REFERENCES "SubmissionProblem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemEvaluation" ADD CONSTRAINT "ProblemEvaluation_assignmentProblemId_fkey" FOREIGN KEY ("assignmentProblemId") REFERENCES "AssignmentProblem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
