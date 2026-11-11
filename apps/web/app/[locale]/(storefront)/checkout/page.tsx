'use client';

import React from 'react';
import { AuthGuard } from '@/components/auth/auth-guard';
import { CheckoutView } from '@/components/storefront/checkout/checkout-view';

export default function CheckoutPage() {
  return (
    <AuthGuard returnUrl="/checkout">
      <CheckoutView />
    </AuthGuard>
  );
}
