-- AlterEnum
ALTER TYPE "OAuthAction" ADD VALUE 'REAUTH';

-- AlterTable
ALTER TABLE "OAuthTransaction" ADD COLUMN "sessionId" TEXT;

-- CreateIndex
CREATE INDEX "OAuthTransaction_sessionId_idx" ON "OAuthTransaction"("sessionId");

-- AddForeignKey
ALTER TABLE "OAuthTransaction" ADD CONSTRAINT "OAuthTransaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

