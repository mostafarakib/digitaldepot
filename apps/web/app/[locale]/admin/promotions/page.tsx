import React from 'react';
import { AdminPlaceholderPage } from '@/components/admin/admin-placeholder-page';
import { TicketPercent } from 'lucide-react';

export default function AdminPromotionsPage() {
  return (
    <AdminPlaceholderPage
      title="Coupons & Discount Promotions"
      description="Create promotional campaigns, configure discount codes, and enforce coupon concurrency limits."
      phase="Phase 5 — Shopping Experience"
      icon={TicketPercent}
    />
  );
}
