'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  X,
  Loader2,
  Package,
  MapPin,
  CreditCard,
  History,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  User,
  ShieldCheck,
  Ban,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AdminOrderDetail, OrderStatus } from '@/lib/order-types';
import {
  getAdminOrderApi,
  updateAdminOrderStatusApi,
  markAdminCodPaidApi,
  ApiError,
} from '@/lib/api-client';
import { AdminCancelOrderDialog } from './admin-cancel-order-dialog';

interface OrderDetailModalProps {
  orderId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onOrderUpdated: () => void;
}

export function OrderDetailModal({
  orderId,
  isOpen,
  onClose,
  onOrderUpdated,
}: OrderDetailModalProps) {
  const t = useTranslations('admin.orders.detailsModal');
  const tOrders = useTranslations('admin.orders');

  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Status transition form state
  const [targetStatus, setTargetStatus] = useState<OrderStatus | ''>('');
  const [transitionReason, setTransitionReason] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusActionSuccess, setStatusActionSuccess] = useState<string | null>(null);
  const [statusActionError, setStatusActionError] = useState<string | null>(null);

  // Mark COD paid state
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  // Cancel dialog state
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);

  const fetchOrderDetails = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getAdminOrderApi(id);
      setOrder(res.order);
      if (res.order.allowedNextStatuses.length > 0) {
        setTargetStatus(res.order.allowedNextStatuses[0]);
      } else {
        setTargetStatus('');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load order details');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    if (isOpen && orderId) {
      getAdminOrderApi(orderId)
        .then((res) => {
          if (!ignore) {
            setOrder(res.order);
            if (res.order.allowedNextStatuses.length > 0) {
              setTargetStatus(res.order.allowedNextStatuses[0]);
            } else {
              setTargetStatus('');
            }
            setIsLoading(false);
          }
        })
        .catch((err) => {
          if (!ignore) {
            if (err instanceof ApiError) {
              setError(err.message);
            } else {
              setError('Failed to load order details');
            }
            setIsLoading(false);
          }
        });
    }

    return () => {
      ignore = true;
    };
  }, [isOpen, orderId]);

  if (!isOpen || !orderId) return null;

  const handleStatusTransition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !targetStatus || !transitionReason.trim()) return;

    setIsUpdatingStatus(true);
    setStatusActionError(null);
    setStatusActionSuccess(null);

    try {
      await updateAdminOrderStatusApi(order.id, {
        status: targetStatus as OrderStatus,
        reason: transitionReason.trim(),
      });
      setStatusActionSuccess(t('statusUpdatedSuccess'));
      setTransitionReason('');
      await fetchOrderDetails(order.id);
      onOrderUpdated();
    } catch (err) {
      if (err instanceof ApiError) {
        setStatusActionError(err.message);
      } else {
        setStatusActionError('Failed to update status.');
      }
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleMarkCodPaid = async () => {
    if (!order) return;
    setIsMarkingPaid(true);
    setStatusActionError(null);
    setStatusActionSuccess(null);

    try {
      await markAdminCodPaidApi(order.id, {
        note: 'Cash on Delivery collected upon order completion',
      });
      setStatusActionSuccess(t('markCodPaidSuccess'));
      await fetchOrderDetails(order.id);
      onOrderUpdated();
    } catch (err) {
      if (err instanceof ApiError) {
        setStatusActionError(err.message);
      } else {
        setStatusActionError('Failed to mark payment as paid.');
      }
    } finally {
      setIsMarkingPaid(false);
    }
  };

  const formatPrice = (poysha: number) => {
    return `৳${(poysha / 100).toLocaleString('en-BD', { minimumFractionDigits: 2 })}`;
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-300">
            Pending
          </Badge>
        );
      case 'CONFIRMED':
        return (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-300">
            Confirmed
          </Badge>
        );
      case 'PROCESSING':
        return (
          <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-300">
            Processing
          </Badge>
        );
      case 'SHIPPED':
        return (
          <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-300">
            Shipped
          </Badge>
        );
      case 'DELIVERED':
        return (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-600 border-emerald-300"
          >
            Delivered
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge
            variant="outline"
            className="bg-destructive/10 text-destructive border-destructive/30"
          >
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-600 border-emerald-300"
          >
            Paid
          </Badge>
        );
      case 'PENDING':
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-300">
            Pending
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge
            variant="outline"
            className="bg-destructive/10 text-destructive border-destructive/30"
          >
            Failed
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-card w-full max-w-4xl max-h-[90vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden relative">
          {/* Header */}
          <div className="px-6 py-4 border-b flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-foreground">
                    {order ? t('title', { orderNumber: order.orderNumber }) : 'Loading Order...'}
                  </h2>
                  {order && getStatusBadge(order.status)}
                  {order && getPaymentStatusBadge(order.paymentStatus)}
                </div>
                {order && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('placedOn', {
                      date: new Date(order.createdAt).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }),
                    })}{' '}
                    • Method: {order.paymentMethod}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/80 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {isLoading && (
              <div className="py-20 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">Loading order snapshot...</p>
              </div>
            )}

            {error && (
              <div className="p-4 bg-destructive/10 text-destructive rounded-xl border border-destructive/20 text-sm flex items-center gap-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {order && !isLoading && (
              <>
                {/* Status action alert banners */}
                {statusActionSuccess && (
                  <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-lg border border-emerald-300 text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{statusActionSuccess}</span>
                  </div>
                )}
                {statusActionError && (
                  <div className="p-3 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{statusActionError}</span>
                  </div>
                )}

                {/* Grid 1: Customer & Address Snapshots */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Customer Info */}
                  <div className="p-4 rounded-xl border bg-card/50 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-2">
                      <User className="w-4 h-4 text-primary" />
                      <span>{t('customerInfo')}</span>
                    </div>
                    <div className="text-xs space-y-1.5 text-muted-foreground">
                      <div>
                        <span className="font-medium text-foreground">Name: </span>
                        {order.customer.firstName} {order.customer.lastName || ''}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Email: </span>
                        {order.customer.email}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Phone: </span>
                        {order.customer.phone || 'N/A'}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Account Role: </span>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {order.customer.role}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Shipping Address Snapshot */}
                  <div className="p-4 rounded-xl border bg-card/50 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-2">
                      <MapPin className="w-4 h-4 text-primary" />
                      <span>{t('shippingAddress')}</span>
                    </div>
                    <div className="text-xs space-y-1 text-muted-foreground">
                      <div className="font-semibold text-foreground text-sm">
                        {order.shippingAddress.recipientName}
                      </div>
                      <div>Phone: {order.shippingAddress.phone}</div>
                      {order.shippingAddress.alternativePhone && (
                        <div>Alt: {order.shippingAddress.alternativePhone}</div>
                      )}
                      <div>
                        {order.shippingAddress.streetAddress}, {order.shippingAddress.upazila},{' '}
                        {order.shippingAddress.districtId}
                      </div>
                      {order.shippingAddress.deliveryNotes && (
                        <div className="mt-1 pt-1 border-t text-muted-foreground italic">
                          &quot;{order.shippingAddress.deliveryNotes}&quot;
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Items Snapshot Table */}
                <div className="rounded-xl border overflow-hidden">
                  <div className="px-4 py-2.5 bg-muted/40 border-b text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('orderItems')}
                  </div>
                  <div className="divide-y">
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        className="p-3.5 flex items-center justify-between text-xs gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative w-12 h-12 rounded-lg bg-muted border overflow-hidden shrink-0">
                            {item.thumbnailUrl ? (
                              <Image
                                src={item.thumbnailUrl}
                                alt={item.productName}
                                fill
                                sizes="48px"
                                className="object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[10px]">
                                No img
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground text-sm">
                              {item.productName}
                            </div>
                            <div className="text-muted-foreground text-[11px] mt-0.5">
                              {item.variantTitle} • SKU: {item.sku}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-semibold text-foreground text-sm">
                            {formatPrice(item.lineTotal)}
                          </div>
                          <div className="text-muted-foreground text-[11px]">
                            {item.quantity} × {formatPrice(item.unitPrice)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Financial Snapshot Footer */}
                  <div className="bg-muted/20 p-4 border-t space-y-1.5 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('subtotal')}</span>
                      <span>{formatPrice(order.merchandiseSubtotal)}</span>
                    </div>
                    {order.coupon && (
                      <div className="flex justify-between text-emerald-600">
                        <span>{t('couponDiscount', { code: order.coupon.code })}</span>
                        <span>-{formatPrice(order.discountAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('shippingFee')}</span>
                      <span>{formatPrice(order.shippingFee)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-foreground pt-1.5 border-t">
                      <span>{t('totalPayable')}</span>
                      <span className="text-primary">{formatPrice(order.totalPayable)}</span>
                    </div>
                  </div>
                </div>

                {/* Fulfillment Actions Card */}
                <div className="p-5 rounded-xl border bg-gradient-to-br from-card to-muted/20 space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      <span>{t('fulfillmentWorkflow')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {order.canCancel && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setIsCancelDialogOpen(true)}
                          className="h-8 text-xs gap-1.5"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          {t('cancelOrderButton')}
                        </Button>
                      )}
                      {order.canMarkCodPaid && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleMarkCodPaid}
                          disabled={isMarkingPaid}
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                        >
                          {isMarkingPaid ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          {t('markCodPaidButton')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {order.allowedNextStatuses.length > 0 ? (
                    <form onSubmit={handleStatusTransition} className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                            {t('advanceStatus')}
                          </label>
                          <select
                            value={targetStatus}
                            onChange={(e) => setTargetStatus(e.target.value as OrderStatus)}
                            className="w-full text-xs rounded-lg border bg-background px-3 py-2 text-foreground font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            {order.allowedNextStatuses.map((st) => (
                              <option key={st} value={st}>
                                Advance to {st}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                            {t('statusReasonLabel')}
                          </label>
                          <input
                            type="text"
                            value={transitionReason}
                            onChange={(e) => setTransitionReason(e.target.value)}
                            placeholder={t('statusReasonPlaceholder')}
                            required
                            className="w-full text-xs rounded-lg border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          size="sm"
                          disabled={isUpdatingStatus || !transitionReason.trim()}
                          className="h-8 text-xs gap-1.5"
                        >
                          {isUpdatingStatus ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                              {t('updatingStatus')}
                            </>
                          ) : (
                            <>
                              <ArrowRight className="w-3.5 h-3.5" />
                              {t('updateStatusButton')}
                            </>
                          )}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="text-xs text-muted-foreground py-1">
                      No further status transitions available for this order in its current state (
                      {order.status}).
                    </div>
                  )}
                </div>

                {/* Payments Section */}
                <div className="p-4 rounded-xl border bg-card/50 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-2">
                    <CreditCard className="w-4 h-4 text-primary" />
                    <span>{t('paymentRecords')}</span>
                  </div>
                  <div className="space-y-2">
                    {order.payments.map((p) => (
                      <div
                        key={p.id}
                        className="p-3 rounded-lg border bg-background flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2 font-semibold text-foreground">
                            <span>{p.method}</span>
                            <span>•</span>
                            <span>{formatPrice(p.amount)}</span>
                            {getPaymentStatusBadge(p.status)}
                          </div>
                          <div className="text-muted-foreground text-[11px] mt-0.5">
                            Ref: {p.transactionId}{' '}
                            {p.gatewayTransactionId && `(Gateway: ${p.gatewayTransactionId})`}
                          </div>
                        </div>
                        <div className="text-muted-foreground text-[11px]">
                          {p.paidAt ? (
                            <span className="text-emerald-600 font-medium">
                              Paid at: {new Date(p.paidAt).toLocaleString()}
                            </span>
                          ) : (
                            `Created: ${new Date(p.createdAt).toLocaleString()}`
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Audit Timeline */}
                <div className="p-4 rounded-xl border bg-card/50 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-2">
                    <History className="w-4 h-4 text-primary" />
                    <span>{t('auditTimeline')}</span>
                  </div>
                  <div className="space-y-2">
                    {order.statusHistory.map((h) => (
                      <div
                        key={h.id}
                        className="p-2.5 rounded-lg border bg-background text-xs flex items-start gap-3"
                      >
                        <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">
                              {h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : h.toStatus}
                            </span>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-[11px] text-muted-foreground">
                              {h.changedByName} {h.changedByRole && `(${h.changedByRole})`}
                            </span>
                          </div>
                          {h.reason && (
                            <p className="text-muted-foreground mt-0.5 text-[11px] italic">
                              &quot;{h.reason}&quot;
                            </p>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground shrink-0">
                          {new Date(h.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t bg-muted/20 flex justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t('close')}
            </Button>
          </div>
        </div>
      </div>

      {order && (
        <AdminCancelOrderDialog
          orderId={order.id}
          orderNumber={order.orderNumber}
          isOpen={isCancelDialogOpen}
          onClose={() => setIsCancelDialogOpen(false)}
          onSuccess={() => {
            fetchOrderDetails(order.id);
            onOrderUpdated();
          }}
        />
      )}
    </>
  );
}
