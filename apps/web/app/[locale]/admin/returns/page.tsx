import React from 'react';
import type { Metadata } from 'next';
import { ReturnManager } from '@/components/admin/returns/return-manager';

export const metadata: Metadata = {
  title: 'Returns & Restocking | Admin Dashboard',
  description:
    'Review customer return requests, inspect returned physical merchandise, and restock inventory.',
};

export default function AdminReturnsPage() {
  return <ReturnManager />;
}
