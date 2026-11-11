import React from 'react';
import type { Metadata } from 'next';
import { CartPageView } from '@/components/storefront/cart/cart-page-view';

export const metadata: Metadata = {
  title: 'Shopping Cart | DigitalDepot',
  description: 'View and manage your shopping cart items before checkout.',
};

export default function CartPage() {
  return <CartPageView />;
}
