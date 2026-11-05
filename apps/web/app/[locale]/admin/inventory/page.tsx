import React from 'react';
import { AdminPlaceholderPage } from '@/components/admin/admin-placeholder-page';
import { Boxes } from 'lucide-react';

export default function AdminInventoryPage() {
  return (
    <AdminPlaceholderPage
      title="Inventory & Stock Tracking"
      description="Variant-level inventory adjustment, low-stock threshold management, and stock audit records."
      phase="Phase 4 — Product Catalogue and Inventory"
      icon={Boxes}
    />
  );
}
