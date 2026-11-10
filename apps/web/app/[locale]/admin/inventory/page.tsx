import React from 'react';
import type { Metadata } from 'next';
import { InventoryManager } from '@/components/admin/inventory/inventory-manager';

export const metadata: Metadata = {
  title: 'Inventory & Stock Management | Admin Dashboard',
  description:
    'Variant-level inventory tracking, atomic stock adjustments, and stock movement audit records.',
};

export default function AdminInventoryPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      <InventoryManager />
    </div>
  );
}
