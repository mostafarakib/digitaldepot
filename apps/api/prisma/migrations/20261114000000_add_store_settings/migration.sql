-- CreateTable
CREATE TABLE "StoreSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "insideDhakaShippingFee" INTEGER NOT NULL DEFAULT 6000,
    "outsideDhakaShippingFee" INTEGER NOT NULL DEFAULT 12000,
    "freeShippingThreshold" INTEGER NOT NULL DEFAULT 500000,
    "estimatedDaysInsideDhakaMin" INTEGER NOT NULL DEFAULT 2,
    "estimatedDaysInsideDhakaMax" INTEGER NOT NULL DEFAULT 3,
    "estimatedDaysOutsideDhakaMin" INTEGER NOT NULL DEFAULT 3,
    "estimatedDaysOutsideDhakaMax" INTEGER NOT NULL DEFAULT 5,
    "storeName" TEXT NOT NULL DEFAULT 'DigitalDepot',
    "supportEmail" TEXT NOT NULL DEFAULT 'support@digitaldepot.local',
    "supportPhone" TEXT DEFAULT '+880 1700-000000',
    "supportHours" TEXT DEFAULT 'Sat – Thu: 10:00 AM – 8:00 PM',
    "storeAddress" TEXT DEFAULT 'Dhaka, Bangladesh',
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSetting_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "check_storesetting_id_default" CHECK ("id" = 'default'),
    CONSTRAINT "check_storesetting_inside_dhaka_fee" CHECK ("insideDhakaShippingFee" >= 0),
    CONSTRAINT "check_storesetting_outside_dhaka_fee" CHECK ("outsideDhakaShippingFee" >= 0),
    CONSTRAINT "check_storesetting_free_shipping_threshold" CHECK ("freeShippingThreshold" >= 0),
    CONSTRAINT "check_storesetting_inside_dhaka_days" CHECK ("estimatedDaysInsideDhakaMin" >= 1 AND "estimatedDaysInsideDhakaMax" >= "estimatedDaysInsideDhakaMin"),
    CONSTRAINT "check_storesetting_outside_dhaka_days" CHECK ("estimatedDaysOutsideDhakaMin" >= 1 AND "estimatedDaysOutsideDhakaMax" >= "estimatedDaysOutsideDhakaMin")
);

-- CreateIndex
CREATE INDEX "StoreSetting_updatedByUserId_idx" ON "StoreSetting"("updatedByUserId");

-- AddForeignKey
ALTER TABLE "StoreSetting" ADD CONSTRAINT "StoreSetting_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed singleton row
INSERT INTO "StoreSetting" (
    "id",
    "insideDhakaShippingFee",
    "outsideDhakaShippingFee",
    "freeShippingThreshold",
    "estimatedDaysInsideDhakaMin",
    "estimatedDaysInsideDhakaMax",
    "estimatedDaysOutsideDhakaMin",
    "estimatedDaysOutsideDhakaMax",
    "storeName",
    "supportEmail",
    "supportPhone",
    "supportHours",
    "storeAddress",
    "updatedAt"
)
VALUES (
    'default',
    6000,
    12000,
    500000,
    2,
    3,
    3,
    5,
    'DigitalDepot',
    'support@digitaldepot.local',
    '+880 1700-000000',
    'Sat – Thu: 10:00 AM – 8:00 PM',
    'Dhaka, Bangladesh',
    NOW()
)
ON CONFLICT ("id") DO NOTHING;

