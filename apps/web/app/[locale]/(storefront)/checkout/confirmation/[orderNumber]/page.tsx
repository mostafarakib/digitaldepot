import React, { use } from 'react';
import { AuthGuard } from '@/components/auth/auth-guard';
import { OrderConfirmationView } from '@/components/storefront/checkout/order-confirmation-view';

interface OrderConfirmationPageProps {
  params: Promise<{
    orderNumber: string;
  }>;
}

export default function OrderConfirmationPage({ params }: OrderConfirmationPageProps) {
  const { orderNumber } = use(params);

  return (
    <AuthGuard returnUrl={`/checkout/confirmation/${encodeURIComponent(orderNumber)}`}>
      <OrderConfirmationView orderNumber={orderNumber} />
    </AuthGuard>
  );
}
