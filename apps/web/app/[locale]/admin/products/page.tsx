import React from 'react';
import { AdminPlaceholderPage } from '@/components/admin/admin-placeholder-page';
import { Package } from 'lucide-react';

export default function AdminProductsPage() {
  return (
    <AdminPlaceholderPage
      title="Product & Variant Management"
      description="Manage catalogue items, technical specifications, variants, pricing, and publication states."
      phase="Phase 4 — Product Catalogue and Inventory"
      icon={Package}
    />
  );
}
