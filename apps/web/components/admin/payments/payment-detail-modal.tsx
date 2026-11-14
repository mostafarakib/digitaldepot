'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  X,
  CreditCard,
  Banknote,
  CheckCircle2,
  Clock,
  AlertCircle,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
  Building,
  User,
  MapPin,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getAdminPaymentDetailApi } from '@/lib/api-client';
import type { AdminPaymentDetailResponse } from '@/lib/payment-types';
import { Link } from '@/i18n/routing';

interface PaymentDetailModalProps {
  paymentId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PaymentDetailModal({ paymentId, isOpen, onClose }: PaymentDetailModalProps) {
  const t = useTranslations('admin.payments');
  const [data, setData] = useState<AdminPaymentDetailResponse['payment'] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    if (isOpen && paymentId) {
      getAdminPaymentDetailApi(paymentId)
        .then((res) => {
          if (!ignore) {
            setData(res.payment);
            setIsLoading(false);
          }
        })
        .catch((err) => {
          if (!ignore) {
            setError(err instanceof Error ? err.message : 'Failed to load payment details');
            setIsLoading(false);
          }
        });
    }

    return () => {
      ignore = true;
    };
  }, [isOpen, paymentId]);

  if (!isOpen || !paymentId) return null;

  const handleClose = () => {
    setData(null);
    setError(null);
    setIsLoading(true);
    onClose();
  };

  const formatCurrency = (poisha: number) => {
    return `৳${(poisha / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="size-3" /> {t(`statusOptions.${status}`)}
          </Badge>
        );
      case 'PENDING':
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 flex items-center gap-1">
            <Clock className="size-3" /> {t(`statusOptions.${status}`)}
          </Badge>
        );
      case 'REFUNDED':
        return (
          <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30 flex items-center gap-1">
            <RotateCcw className="size-3" /> {t(`statusOptions.${status}`)}
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30 flex items-center gap-1">
            <AlertCircle className="size-3" /> {t(`statusOptions.${status}`)}
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              {data?.method === 'COD' ? (
                <Banknote className="size-5" />
              ) : (
                <CreditCard className="size-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg text-slate-900 dark:text-white">
                  {data?.transactionId || t('modal.title')}
                </h3>
                {data && renderStatusBadge(data.status)}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {data
                  ? `${t('method')}: ${data.method} • ${new Date(data.createdAt).toLocaleString()}`
                  : 'Loading...'}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose} className="rounded-full">
            <X className="size-4" />
          </Button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {isLoading && (
            <div className="py-16 text-center text-slate-500 dark:text-slate-400">
              <Clock className="size-8 mx-auto animate-spin mb-2 opacity-60" />
              <p className="text-sm">{t('modal.loading')}</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg text-rose-700 dark:text-rose-400 text-sm">
              {error}
            </div>
          )}

          {data && (
            <>
              {/* Financial Breakdown Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60">
                  <CardContent className="p-3.5">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {t('modal.authorizedAmount')}
                    </span>
                    <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                      {formatCurrency(data.amount)}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60">
                  <CardContent className="p-3.5">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {t('modal.capturedAmount')}
                    </span>
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                      {data.status === 'PAID' || data.status === 'REFUNDED'
                        ? formatCurrency(data.amount)
                        : formatCurrency(0)}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60">
                  <CardContent className="p-3.5">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {t('modal.totalRefunded')}
                    </span>
                    <div className="text-lg font-bold text-purple-600 dark:text-purple-400 mt-1">
                      {formatCurrency(data.refundedAmount)}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60">
                  <CardContent className="p-3.5">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {t('modal.netRetained')}
                    </span>
                    <div className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-1">
                      {formatCurrency(data.netAmount)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Gateway & Validation References */}
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/70 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-blue-600 dark:text-blue-400" />
                  {t('modal.gatewayVerification')}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('modal.internalRef')}:
                    </span>
                    <p className="font-mono font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                      {data.transactionId}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('modal.gatewayRef')}:
                    </span>
                    <p className="font-mono font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                      {data.gatewayTransactionId || t('modal.notApplicable')}
                    </p>
                  </div>
                  {data.safeGatewayDetails && (
                    <>
                      {data.safeGatewayDetails.cardBrand && (
                        <div>
                          <span className="text-slate-500 dark:text-slate-400">
                            {t('modal.cardBrand')}:
                          </span>
                          <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                            {data.safeGatewayDetails.cardBrand} (
                            {data.safeGatewayDetails.cardType || 'Card'})
                          </p>
                        </div>
                      )}
                      {data.safeGatewayDetails.cardIssuer && (
                        <div>
                          <span className="text-slate-500 dark:text-slate-400">
                            {t('modal.issuer')}:
                          </span>
                          <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                            {data.safeGatewayDetails.cardIssuer}
                          </p>
                        </div>
                      )}
                      {data.safeGatewayDetails.cardNo && (
                        <div>
                          <span className="text-slate-500 dark:text-slate-400">
                            {t('modal.maskedCard')}:
                          </span>
                          <p className="font-mono font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                            {data.safeGatewayDetails.cardNo}
                          </p>
                        </div>
                      )}
                      {data.safeGatewayDetails.gatewayStatus && (
                        <div>
                          <span className="text-slate-500 dark:text-slate-400">
                            {t('modal.gatewayStatus')}:
                          </span>
                          <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                            {data.safeGatewayDetails.gatewayStatus}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Linked Order Snapshot */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <User className="size-4 text-blue-600 dark:text-blue-400" />
                    {t('modal.linkedOrder')}
                  </h4>
                  <Link
                    href={`/admin/orders?search=${encodeURIComponent(data.order.orderNumber)}`}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    {t('modal.viewOrder')} <ExternalLink className="size-3" />
                  </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50/50 dark:bg-slate-800/30 p-3 rounded-md">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('modal.orderNumber')}:
                    </span>
                    <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                      {data.order.orderNumber}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('modal.customer')}:
                    </span>
                    <p className="font-medium text-slate-900 dark:text-white mt-0.5">
                      {data.order.customer.name} ({data.order.customer.email})
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('modal.recipientAddress')}:
                    </span>
                    <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                      {data.order.shippingAddress.recipientName}, {data.order.shippingAddress.phone}
                      <br />
                      {data.order.shippingAddress.streetAddress},{' '}
                      {data.order.shippingAddress.upazila}, {data.order.shippingAddress.districtId}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('modal.orderTotal')}:
                    </span>
                    <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                      {formatCurrency(data.order.totalPayable)}
                    </p>
                  </div>
                </div>

                {/* Items Summary */}
                <div className="space-y-2 pt-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {t('modal.orderItems')} ({data.order.items.length})
                  </span>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-md">
                    {data.order.items.map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 flex items-center justify-between text-xs"
                      >
                        <div className="flex-1 pr-4">
                          <p className="font-medium text-slate-800 dark:text-slate-200">
                            {item.productName}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {item.variantTitle} • SKU: {item.sku}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-medium text-slate-800 dark:text-slate-200">
                            {formatCurrency(item.unitPrice)} × {item.quantity}
                          </p>
                          <p className="text-[11px] font-semibold text-slate-900 dark:text-white">
                            {formatCurrency(item.lineTotal)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Linked Refund Records */}
              {data.refunds.length > 0 && (
                <div className="border border-purple-200 dark:border-purple-900/50 rounded-lg p-4 space-y-3 bg-purple-50/20 dark:bg-purple-950/10">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                    <RotateCcw className="size-4 text-purple-600 dark:text-purple-400" />
                    {t('modal.refundHistory')} ({data.refunds.length})
                  </h4>
                  <div className="space-y-2">
                    {data.refunds.map((refund) => (
                      <div
                        key={refund.id}
                        className="p-3 bg-white dark:bg-slate-900 border border-purple-100 dark:border-purple-900/40 rounded-md text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {refund.refundNumber}
                            </span>
                            <Badge variant="outline" className="text-[10px] py-0">
                              {refund.method}
                            </Badge>
                            <Badge
                              className={
                                refund.status === 'COMPLETED'
                                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                              }
                            >
                              {refund.status}
                            </Badge>
                          </div>
                          <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-1">
                            {refund.payoutReference
                              ? `Ref: ${refund.payoutReference}`
                              : refund.gatewayReference
                                ? `Ref: ${refund.gatewayReference}`
                                : ''}
                            {refund.processedBy ? ` • Processed by ${refund.processedBy.name}` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold text-purple-600 dark:text-purple-400 text-sm">
                            {formatCurrency(refund.amount)}
                          </span>
                          <p className="text-[11px] text-slate-400">
                            {new Date(refund.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sister Attempts on the Same Order */}
              {data.order.otherPaymentAttempts.length > 1 && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    {t('modal.allAttemptsForOrder')} ({data.order.otherPaymentAttempts.length})
                  </h4>
                  <div className="space-y-1.5">
                    {data.order.otherPaymentAttempts.map((att) => (
                      <div
                        key={att.id}
                        className={`p-2.5 rounded border text-xs flex items-center justify-between ${
                          att.id === data.id
                            ? 'bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/50'
                            : 'bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px]">{att.transactionId}</span>
                          <Badge variant="outline" className="text-[10px] py-0">
                            {att.method}
                          </Badge>
                          {att.id === data.id && (
                            <Badge className="bg-blue-500/10 text-blue-600 text-[9px] py-0">
                              {t('modal.current')}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">{formatCurrency(att.amount)}</span>
                          {renderStatusBadge(att.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <Button variant="outline" size="sm" onClick={handleClose}>
            {t('modal.close')}
          </Button>
        </div>
      </div>
    </div>
  );
}
