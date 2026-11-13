'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { getCustomerReturnDetailApi, ApiError } from '@/lib/api-client';
import type { CustomerReturnDetail, ReturnRequestStatus } from '@/lib/order-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CancelReturnDialog } from './cancel-return-dialog';
import {
  RotateCcw,
  Calendar,
  Clock,
  CheckCircle2,
  Package,
  XCircle,
  ArrowLeft,
  AlertTriangle,
  History,
  FileText,
  CreditCard,
} from 'lucide-react';

interface ReturnDetailViewProps {
  returnNumber: string;
}

export function ReturnDetailView({ returnNumber }: ReturnDetailViewProps) {
  const t = useTranslations('returns');

  const [returnDetail, setReturnDetail] = useState<CustomerReturnDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  const fetchReturn = useCallback(() => {
    setIsLoading(true);
    setError(null);
    getCustomerReturnDetailApi(returnNumber)
      .then((res) => {
        setReturnDetail(res.return);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Failed to load return details.');
        }
        setIsLoading(false);
      });
  }, [returnNumber]);

  useEffect(() => {
    let ignore = false;

    getCustomerReturnDetailApi(returnNumber)
      .then((res) => {
        if (!ignore) {
          setReturnDetail(res.return);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError('Failed to load return details.');
          }
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [returnNumber]);

  const formatPrice = (poysha: number) => {
    return `৳${(poysha / 100).toLocaleString('en-BD', { minimumFractionDigits: 2 })}`;
  };

  const getStatusBadge = (status: ReturnRequestStatus) => {
    switch (status) {
      case 'REQUESTED':
        return (
          <Badge
            variant="outline"
            className="border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-500/10 gap-1 text-xs"
          >
            <Clock className="size-3.5" />
            <span>{t('status.REQUESTED')}</span>
          </Badge>
        );
      case 'APPROVED':
        return (
          <Badge
            variant="outline"
            className="border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-500/10 gap-1 text-xs"
          >
            <CheckCircle2 className="size-3.5" />
            <span>{t('status.APPROVED')}</span>
          </Badge>
        );
      case 'RECEIVED':
        return (
          <Badge
            variant="outline"
            className="border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 gap-1 text-xs"
          >
            <Package className="size-3.5" />
            <span>{t('status.RECEIVED')}</span>
          </Badge>
        );
      case 'COMPLETED':
        return (
          <Badge
            variant="outline"
            className="border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 gap-1 text-xs"
          >
            <CheckCircle2 className="size-3.5" />
            <span>{t('status.COMPLETED')}</span>
          </Badge>
        );
      case 'REJECTED':
        return (
          <Badge
            variant="outline"
            className="border-destructive text-destructive bg-destructive/10 gap-1 text-xs"
          >
            <XCircle className="size-3.5" />
            <span>{t('status.REJECTED')}</span>
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge
            variant="outline"
            className="border-border text-muted-foreground bg-muted gap-1 text-xs"
          >
            <XCircle className="size-3.5" />
            <span>{t('status.CANCELLED')}</span>
          </Badge>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
        <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm">Loading return details...</p>
      </div>
    );
  }

  if (error || !returnDetail) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto py-12 text-center">
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error || 'Return request not found'}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/account/returns">
            <ArrowLeft className="size-4 mr-1.5" />
            <span>{t('backToReturns')}</span>
          </Link>
        </Button>
      </div>
    );
  }

  const isRequested = returnDetail.status === 'REQUESTED';
  const isRejected = returnDetail.status === 'REJECTED';
  const isCancelled = returnDetail.status === 'CANCELLED';

  return (
    <div className="space-y-6">
      {/* Navigation & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Button asChild variant="outline" size="sm" className="self-start gap-1.5 text-xs">
          <Link href="/account/returns">
            <ArrowLeft className="size-3.5" />
            <span>{t('backToReturns')}</span>
          </Link>
        </Button>

        {isRequested && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setIsCancelModalOpen(true)}
            className="self-start text-xs"
          >
            {t('cancelReturn')}
          </Button>
        )}
      </div>

      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {t('details.pageSubtitle', { returnNumber: returnDetail.returnNumber })}
            </h1>
            {getStatusBadge(returnDetail.status)}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <span className="flex items-center gap-1">
              <Calendar className="size-3.5" />
              <span>
                {t('requestedOn', {
                  date: new Date(returnDetail.createdAt).toLocaleDateString(),
                })}
              </span>
            </span>
            <span>•</span>
            <Link
              href={`/account/orders/${returnDetail.orderNumber}`}
              className="text-primary hover:underline font-medium"
            >
              {t('orderNumber', { orderNumber: returnDetail.orderNumber })}
            </Link>
          </div>
        </div>
      </div>

      {/* Status Warning Banners */}
      {isRejected && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-1">
          <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
            <AlertTriangle className="size-4" />
            <span>{t('details.rejectionNotice')}</span>
          </div>
          {returnDetail.rejectionReason && (
            <p className="text-xs text-muted-foreground pl-6">
              {t('details.rejectionReasonLabel', { reason: returnDetail.rejectionReason })}
            </p>
          )}
        </div>
      )}

      {isCancelled && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-center gap-2 text-muted-foreground text-xs">
          <XCircle className="size-4 text-muted-foreground shrink-0" />
          <span>{t('details.cancelledNotice')}</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Items & Notes */}
        <div className="lg:col-span-2 space-y-6">
          {/* Returned Items Card */}
          <Card>
            <CardHeader className="pb-3 border-b border-border/60">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Package className="size-4 text-primary" />
                <span>{t('details.itemsTitle', { count: returnDetail.items.length })}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 divide-y divide-border/60">
              {returnDetail.items.map((item) => (
                <div
                  key={item.id}
                  className="pt-4 first:pt-0 pb-4 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    {item.thumbnailUrl ? (
                      <Image
                        src={item.thumbnailUrl}
                        alt={item.productName}
                        width={64}
                        height={64}
                        className="size-16 rounded-xl object-cover border border-border shrink-0"
                      />
                    ) : (
                      <div className="size-16 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shrink-0 border border-border">
                        <Package className="size-6" />
                      </div>
                    )}
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-foreground leading-snug">
                        {item.productName}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {item.variantTitle} • SKU: {item.sku}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Qty: {item.quantity} × {formatPrice(item.unitPrice)}
                      </p>
                      {item.reason && (
                        <p className="text-xs text-muted-foreground italic">
                          Reason: {item.reason}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-bold text-foreground">
                      {formatPrice(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Customer Reason & Notes */}
          <Card>
            <CardHeader className="pb-3 border-b border-border/60">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                <span>{t('details.customerNotesTitle')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-2 text-xs">
              <div>
                <span className="font-semibold text-foreground">Return Reason: </span>
                <span className="text-muted-foreground">
                  {t(`reasons.${returnDetail.customerReason}` as any) ||
                    returnDetail.customerReason}
                </span>
              </div>
              {returnDetail.customerNotes && (
                <div className="pt-2 border-t border-border/40">
                  <span className="font-semibold text-foreground">Comments: </span>
                  <p className="text-muted-foreground mt-1 whitespace-pre-line leading-relaxed">
                    {returnDetail.customerNotes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Refund Summary & Timeline */}
        <div className="space-y-6">
          {/* Refund Summary Card */}
          <Card>
            <CardHeader className="pb-3 border-b border-border/60">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CreditCard className="size-4 text-primary" />
                <span>{t('details.refundSummaryTitle')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-3 text-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{t('estimatedRefund')}</span>
                <span className="font-mono font-medium text-foreground">
                  {formatPrice(returnDetail.estimatedRefundAmount)}
                </span>
              </div>

              {returnDetail.actualRefundAmount !== null && (
                <div className="border-t border-border/60 pt-2 flex items-center justify-between font-bold text-sm text-foreground">
                  <span>{t('actualRefund')}</span>
                  <span className="text-primary font-mono">
                    {formatPrice(returnDetail.actualRefundAmount)}
                  </span>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground pt-1 leading-relaxed">
                {returnDetail.actualRefundAmount !== null
                  ? t('details.actualRefundNote')
                  : t('details.estimatedRefundNote')}
              </p>
            </CardContent>
          </Card>

          {/* Status Timeline */}
          {returnDetail.statusHistory && returnDetail.statusHistory.length > 0 && (
            <Card>
              <CardHeader className="pb-3 border-b border-border/60">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <History className="size-4 text-primary" />
                  <span>{t('details.statusTimelineTitle')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-3 text-xs">
                {returnDetail.statusHistory.map((item) => (
                  <div
                    key={item.id}
                    className="relative pl-4 border-l border-border pb-3 last:pb-0"
                  >
                    <div className="absolute -left-1.5 top-0 size-3 rounded-full bg-primary/40 border border-background" />
                    <p className="font-semibold text-foreground">
                      {t(`status.${item.toStatus}` as any)}
                    </p>
                    {item.reason && (
                      <p className="text-muted-foreground text-[11px] mt-0.5">{item.reason}</p>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Cancellation Dialog */}
      {isCancelModalOpen && (
        <CancelReturnDialog
          returnNumber={returnDetail.returnNumber}
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
          onSuccess={fetchReturn}
        />
      )}
    </div>
  );
}
