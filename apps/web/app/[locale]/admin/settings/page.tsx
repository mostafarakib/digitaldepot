import React from 'react';
import { AdminPlaceholderPage } from '@/components/admin/admin-placeholder-page';
import { Settings } from 'lucide-react';

export default function AdminSettingsPage() {
  return (
    <AdminPlaceholderPage
      title="Store Settings & Configuration"
      description="Configure store metadata, shipping fee tables, tax settings, and service connections."
      phase="Phase 8 — Platform Polish and Production Readiness"
      icon={Settings}
    />
  );
}
