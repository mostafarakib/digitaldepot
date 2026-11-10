-- CreateEnum
CREATE TYPE "InventoryAdjustmentType" AS ENUM ('RECEIVE', 'CORRECTION', 'DAMAGE', 'THEFT_LOSS', 'RETURN_RESTOCK');

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryAdjustment" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "type" "InventoryAdjustmentType" NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "oldQuantity" INTEGER NOT NULL,
    "newQuantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "adjustedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_variantId_key" ON "InventoryItem"("variantId");

-- CreateIndex
CREATE INDEX "InventoryItem_variantId_idx" ON "InventoryItem"("variantId");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_inventoryItemId_createdAt_idx" ON "InventoryAdjustment"("inventoryItemId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_adjustedByUserId_idx" ON "InventoryAdjustment"("adjustedByUserId");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_type_idx" ON "InventoryAdjustment"("type");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_adjustedByUserId_fkey" FOREIGN KEY ("adjustedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Check Constraints: Enforce non-negative stock and non-zero adjustment delta
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_quantity_non_negative" CHECK ("quantity" >= 0);
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_reserved_quantity_non_negative" CHECK ("reservedQuantity" >= 0);
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_available_non_negative" CHECK ("quantity" >= "reservedQuantity");
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_quantityDelta_non_zero" CHECK ("quantityDelta" != 0);

-- Backfill existing ProductVariant records with an initial InventoryItem
INSERT INTO "InventoryItem" ("id", "variantId", "quantity", "reservedQuantity", "lowStockThreshold", "createdAt", "updatedAt")
SELECT 'inv_' || "id", "id", 0, 0, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ProductVariant"
ON CONFLICT ("variantId") DO NOTHING;

