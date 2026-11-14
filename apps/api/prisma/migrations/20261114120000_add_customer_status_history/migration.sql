-- CreateTable
CREATE TABLE "CustomerStatusHistory" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fromStatus" "UserStatus",
    "toStatus" "UserStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerStatusHistory_customerId_createdAt_idx" ON "CustomerStatusHistory"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerStatusHistory_changedByUserId_idx" ON "CustomerStatusHistory"("changedByUserId");

-- CreateIndex
CREATE INDEX "CustomerStatusHistory_createdAt_idx" ON "CustomerStatusHistory"("createdAt");

-- AddForeignKey
ALTER TABLE "CustomerStatusHistory" ADD CONSTRAINT "CustomerStatusHistory_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerStatusHistory" ADD CONSTRAINT "CustomerStatusHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

