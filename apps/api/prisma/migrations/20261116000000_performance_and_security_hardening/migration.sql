-- CreateIndex
CREATE INDEX "NotificationDelivery_channel_status_nextAttemptAt_idx" ON "NotificationDelivery"("channel", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Product_status_featured_publishedAt_createdAt_idx" ON "Product"("status", "featured", "publishedAt" DESC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Product_status_publishedAt_createdAt_idx" ON "Product"("status", "publishedAt" DESC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Product_status_categoryId_idx" ON "Product"("status", "categoryId");

-- CreateIndex
CREATE INDEX "Product_status_brandId_idx" ON "Product"("status", "brandId");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_isActive_price_idx" ON "ProductVariant"("productId", "isActive", "price");

