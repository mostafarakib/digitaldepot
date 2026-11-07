-- CreateEnum
CREATE TYPE "SecurityTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "SecurityToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SecurityTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SecurityToken_tokenHash_key" ON "SecurityToken"("tokenHash");

-- CreateIndex
CREATE INDEX "SecurityToken_userId_type_idx" ON "SecurityToken"("userId", "type");

-- CreateIndex
CREATE INDEX "SecurityToken_expiresAt_idx" ON "SecurityToken"("expiresAt");

-- Enforce at most one active (unconsumed) security token per user and type
CREATE UNIQUE INDEX "unique_active_user_security_token"
ON "SecurityToken" ("userId", "type")
WHERE "consumedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "SecurityToken" ADD CONSTRAINT "SecurityToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

