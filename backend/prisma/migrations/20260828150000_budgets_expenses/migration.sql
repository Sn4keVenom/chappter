-- CreateEnum
CREATE TYPE "ReimbursementStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REIMBURSED', 'REJECTED');

-- CreateTable
CREATE TABLE "CommitteeBudget" (
    "id" TEXT NOT NULL,
    "committeeId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "allocated" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommitteeBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "committeeId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "receiptLabel" TEXT,
    "status" "ReimbursementStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reimbursementMethod" "PaymentMethod",
    "reimbursementNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommitteeBudget_semesterId_idx" ON "CommitteeBudget"("semesterId");
-- CreateIndex
CREATE UNIQUE INDEX "CommitteeBudget_committeeId_semesterId_key" ON "CommitteeBudget"("committeeId", "semesterId");
-- CreateIndex
CREATE INDEX "Expense_committeeId_status_idx" ON "Expense"("committeeId", "status");
-- CreateIndex
CREATE INDEX "Expense_submittedById_idx" ON "Expense"("submittedById");

-- AddForeignKey
ALTER TABLE "CommitteeBudget" ADD CONSTRAINT "CommitteeBudget_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CommitteeBudget" ADD CONSTRAINT "CommitteeBudget_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "ChapterMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
