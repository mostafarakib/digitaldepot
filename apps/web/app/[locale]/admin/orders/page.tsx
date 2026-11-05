import React from 'react';
import { AdminPlaceholderPage } from '@/components/admin/admin-placeholder-page';
import { ShoppingBag } from 'lucide-react';

export default function AdminOrdersPage() {
  return (
    <AdminPlaceholderPage
      title="Orders & Shipments Fulfillment"
      description="Process customer orders, verify payments, manage delivery workflows, and track immutable order history."
      phase="Phase 6 — Checkout, Orders, and Payments"
      icon={ShoppingBag}
    />
  );
}
