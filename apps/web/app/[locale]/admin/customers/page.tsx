import React from 'react';
import { AdminPlaceholderPage } from '@/components/admin/admin-placeholder-page';
import { Users } from 'lucide-react';

export default function AdminCustomersPage() {
  return (
    <AdminPlaceholderPage
      title="Customer Accounts & Profiles"
      description="Customer directory, address management, order histories, and account status."
      phase="Phase 3 — Authentication and Customer Accounts"
      icon={Users}
    />
  );
}
