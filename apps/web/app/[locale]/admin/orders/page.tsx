import React from 'react';
import type { Metadata } from 'next';
import { OrderManager } from '@/components/admin/orders/order-manager';

export const metadata: Metadata = {
  title: 'Orders & Shipments Fulfillment | Admin Dashboard',
  description:
    'Process customer purchases, advance fulfillment workflows, and manage order lifecycles.',
};

export default function AdminOrdersPage() {
  return <OrderManager />;
}
