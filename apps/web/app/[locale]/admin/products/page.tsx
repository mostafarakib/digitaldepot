import React from 'react';
import type { Metadata } from 'next';
import { ProductManager } from '@/components/admin/products/product-manager';

export const metadata: Metadata = {
  title: 'Product & Variant Management | Admin Dashboard',
  description: 'Manage catalogue products, variants, pricing, specifications, and images.',
};

export default function AdminProductsPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      <ProductManager />
    </div>
  );
}
