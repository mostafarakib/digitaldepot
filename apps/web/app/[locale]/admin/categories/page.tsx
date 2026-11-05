import React from 'react';
import { AdminPlaceholderPage } from '@/components/admin/admin-placeholder-page';
import { Tags } from 'lucide-react';

export default function AdminCategoriesPage() {
  return (
    <AdminPlaceholderPage
      title="Category & Brand Management"
      description="Hierarchical category taxonomy, brand associations, and catalogue browsing structure."
      phase="Phase 4 — Product Catalogue and Inventory"
      icon={Tags}
    />
  );
}
