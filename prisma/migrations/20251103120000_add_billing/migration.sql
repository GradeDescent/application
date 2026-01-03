-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('USER', 'ORG');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('CREDIT', 'CHARGE', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "BillingMetric" AS ENUM ('vision_page', 'grade_problem', 'split_tex');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "ownerUserId" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseBilling" (
    "courseId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseBilling_pkey" PRIMARY KEY ("courseId")
);

-- CreateTable
CREATE TABLE "AccountBalance" (
    "accountId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "balanceMicrodollars" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountBalance_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amountMicrodollars" BIGINT NOT NULL,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "idempotencyKey" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCard" (
    "id" TEXT NOT NULL,
    "metric" "BillingMetric" NOT NULL,
    "unitPriceMicrodollars" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "meta" JSONB,

    CONSTRAINT "RateCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "metric" "BillingMetric" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMicrodollars" BIGINT NOT NULL,
    "costMicrodollars" BIGINT NOT NULL,
    "assignmentId" TEXT,
    "submissionId" TEXT,
    "evaluationId" TEXT,
    "pipelineRunId" TEXT,
    "pipelineStepId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_type_ownerUserId_key" ON "Account"("type", "ownerUserId");

-- CreateIndex
CREATE INDEX "CourseBilling_accountId_idx" ON "CourseBilling"("accountId");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_createdAt_idx" ON "LedgerEntry"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_relatedType_relatedId_idx" ON "LedgerEntry"("relatedType", "relatedId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_accountId_idempotencyKey_key" ON "LedgerEntry"("accountId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "RateCard_metric_active_effectiveFrom_idx" ON "RateCard"("metric", "active", "effectiveFrom");

-- CreateIndex
CREATE INDEX "UsageEvent_accountId_createdAt_idx" ON "UsageEvent"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_courseId_createdAt_idx" ON "UsageEvent"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_metric_idx" ON "UsageEvent"("metric");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseBilling" ADD CONSTRAINT "CourseBilling_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseBilling" ADD CONSTRAINT "CourseBilling_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountBalance" ADD CONSTRAINT "AccountBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
