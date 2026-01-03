-- Speed up latest submission lookup per assignment/user
CREATE INDEX "Submission_assignmentId_userId_createdAt_idx"
  ON "Submission"("assignmentId", "userId", "createdAt");
