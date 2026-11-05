import React from 'react';
import { AdminPlaceholderPage } from '@/components/admin/admin-placeholder-page';
import { MessageSquare } from 'lucide-react';

export default function AdminReviewsPage() {
  return (
    <AdminPlaceholderPage
      title="Product Review Moderation"
      description="Moderate customer product ratings, verify delivered purchase eligibility, and manage feedback."
      phase="Phase 5 — Shopping Experience"
      icon={MessageSquare}
    />
  );
}
