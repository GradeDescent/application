-- Change problem evaluation score to integer
ALTER TABLE "ProblemEvaluation"
  ALTER COLUMN "score" TYPE INTEGER
  USING ROUND("score")::INTEGER;
