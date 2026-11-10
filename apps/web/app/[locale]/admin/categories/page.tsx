import React from 'react';
import type { Metadata } from 'next';
import { CategoryBrandManager } from '@/components/admin/catalogue/category-brand-manager';

export const metadata: Metadata = {
  title: 'Category & Brand Management | Admin Dashboard',
  description: 'Manage catalogue categories, hierarchical taxonomy, and brand associations.',
};

export default function AdminCategoriesPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      <CategoryBrandManager />
    </div>
  );
}
