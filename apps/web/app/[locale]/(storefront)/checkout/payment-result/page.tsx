import React, { use } from 'react';
import { AuthGuard } from '@/components/auth/auth-guard';
import { PaymentResultView } from '@/components/storefront/checkout/payment-result-view';

interface PaymentResultPageProps {
  searchParams: Promise<{
    orderNumber?: string;
    status?: string;
    reason?: string;
  }>;
}

export default function PaymentResultPage({ searchParams }: PaymentResultPageProps) {
  const params = use(searchParams);

  return (
    <AuthGuard returnUrl="/checkout">
      <PaymentResultView
        orderNumber={params.orderNumber}
        status={params.status}
        reason={params.reason}
      />
    </AuthGuard>
  );
}
