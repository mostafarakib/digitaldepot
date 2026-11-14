'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  X,
  Loader2,
  User,
  Mail,
  Phone,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  Clock,
  MapPin,
  ShoppingBag,
  RotateCcw,
  CreditCard,
  Ban,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { AdminCustomerDetail } from '@/lib/customer-types';
import { getAdminCustomerDetailApi } from '@/lib/api-client';
import { CustomerStatusDialog } from './customer-status-dialog';

interface CustomerDetailModalProps {
  customerId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onCustomerUpdated: () => void;
}

type ActiveTab = 'overview' | 'addresses' | 'orders' | 'returns';

export function CustomerDetailModal({
  customerId,
  isOpen,
  onClose,
  onCustomerUpdated,
}: CustomerDetailModalProps) {
  const t = useTranslations('admin.customers.detailModal');
  const tCommon = useTranslations('common');

  const [customer, setCustomer] = useState<AdminCustomerDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // Status dialog state
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);

  const loadCustomer = useCallback(async () => {
    if (!customerId) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await getAdminCustomerDetailApi(customerId);
      setCustomer(res.customer);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('errorLoading'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId, t]);

  useEffect(() => {
    let ignore = false;
    if (isOpen && customerId) {
      getAdminCustomerDetailApi(customerId)
        .then((res) => {
          if (!ignore) {
            setCustomer(res.customer);
            setIsLoading(false);
          }
        })
        .catch((err) => {
          if (!ignore) {
            setErrorMessage(err instanceof Error ? err.message : t('errorLoading'));
            setIsLoading(false);
          }
        });
    }

    return () => {
      ignore = true;
    };
  }, [isOpen, customerId, t]);

  if (!isOpen || !customerId) return null;

  const fullName = customer?.profile
    ? `${customer.profile.firstName} ${customer.profile.lastName}`.trim()
    : (customer?.email.split('@')[0] ?? '');

  const formatCurrency = (poisha: number) => {
    return `৳${(poisha / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (isoStr: string | null) => {
    if (!isoStr) return '—';
    return new Date(isoStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleStatusDialogSuccess = () => {
    void loadCustomer();
    onCustomerUpdated();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-card w-full max-w-4xl max-h-[90vh] rounded-xl border shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b shrink-0 bg-muted/20">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                {fullName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight">{fullName}</h2>
                  {customer && (
                    <Badge
                      variant="outline"
                      className={
                        customer.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                          : 'bg-destructive/10 text-destructive border-destructive/30'
                      }
                    >
                      {customer.status}
                    </Badge>
                  )}
                  {customer?.emailVerified && (
                    <Badge
                      variant="outline"
                      className="bg-blue-500/10 text-blue-600 border-blue-500/30 gap-1"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {t('verified')}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{customer?.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {customer && (
                <Button
                  size="sm"
                  variant={customer.status === 'ACTIVE' ? 'outline' : 'default'}
                  onClick={() => setIsStatusDialogOpen(true)}
                  className="gap-1.5"
                >
                  {customer.status === 'ACTIVE' ? (
                    <>
                      <Ban className="w-4 h-4 text-destructive" />
                      <span className="text-destructive">{t('suspendCustomer')}</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>{t('reactivateCustomer')}</span>
                    </>
                  )}
                </Button>
              )}
              <Button size="icon" variant="ghost" onClick={onClose} aria-label={tCommon('close')}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">{tCommon('loading')}</p>
              </div>
            ) : errorMessage ? (
              <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg flex items-center gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="text-sm">{errorMessage}</p>
              </div>
            ) : customer ? (
              <>
                {/* Financial KPI Summary Bar */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="p-4 bg-primary/5 border-primary/20">
                    <p className="text-xs font-medium text-muted-foreground">{t('netLtv')}</p>
                    <p className="text-2xl font-bold text-primary mt-1">
                      {formatCurrency(customer.financials.lifetimeValue)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {t('grossSpend')}: {formatCurrency(customer.financials.grossSpent)}
                    </p>
                  </Card>

                  <Card className="p-4">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t('totalRefunded')}
                    </p>
                    <p className="text-2xl font-bold text-muted-foreground mt-1">
                      {formatCurrency(customer.financials.totalRefunded)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {customer.orderStats.completedReturnCount} {t('completedReturns')}
                    </p>
                  </Card>

                  <Card className="p-4">
                    <p className="text-xs font-medium text-muted-foreground">{t('totalOrders')}</p>
                    <p className="text-2xl font-bold mt-1">{customer.orderStats.totalOrderCount}</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">
                      {customer.orderStats.completedOrderCount} {t('deliveredOrders')}
                    </p>
                  </Card>

                  <Card className="p-4">
                    <p className="text-xs font-medium text-muted-foreground">{t('registeredOn')}</p>
                    <p className="text-sm font-semibold mt-2">{formatDate(customer.createdAt)}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {t('lastActive')}: {formatDate(customer.lastActiveAt)}
                    </p>
                  </Card>
                </div>

                {/* Tabs Navigation */}
                <div className="flex border-b space-x-6 text-sm font-medium">
                  <button
                    type="button"
                    onClick={() => setActiveTab('overview')}
                    className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
                      activeTab === 'overview'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <User className="w-4 h-4" />
                    {t('tabs.overview')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('addresses')}
                    className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
                      activeTab === 'addresses'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <MapPin className="w-4 h-4" />
                    {t('tabs.addresses')} ({customer.addresses.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('orders')}
                    className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
                      activeTab === 'orders'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <ShoppingBag className="w-4 h-4" />
                    {t('tabs.orders')} ({customer.recentOrders.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('returns')}
                    className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
                      activeTab === 'returns'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <RotateCcw className="w-4 h-4" />
                    {t('tabs.returns')} ({customer.recentReturns.length})
                  </button>
                </div>

                {/* Tab Contents */}
                {activeTab === 'overview' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card className="p-4 space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          {t('contactInfo')}
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Mail className="w-4 h-4 shrink-0" />
                            <span>{customer.email}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="w-4 h-4 shrink-0" />
                            <span>{customer.profile?.phone || t('notProvided')}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                            <span>
                              {customer.emailVerified
                                ? `${t('verifiedOn')} ${formatDate(customer.emailVerifiedAt)}`
                                : t('notVerified')}
                            </span>
                          </div>
                        </div>
                      </Card>

                      <Card className="p-4 space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          {t('accountSecurity')}
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between items-center py-1 border-b">
                            <span className="text-muted-foreground">{t('userId')}</span>
                            <span className="font-mono text-xs">{customer.id}</span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b">
                            <span className="text-muted-foreground">{t('linkedOauth')}</span>
                            <span>
                              {customer.oauthAccounts.length > 0
                                ? customer.oauthAccounts.map((oa) => oa.provider).join(', ')
                                : t('none')}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1">
                            <span className="text-muted-foreground">{t('lastActivity')}</span>
                            <span className="text-xs">{formatDate(customer.lastActiveAt)}</span>
                          </div>
                        </div>
                      </Card>
                    </div>
                  </div>
                )}

                {activeTab === 'addresses' && (
                  <div className="space-y-3">
                    {customer.addresses.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground text-sm">
                        <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        {t('noAddresses')}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {customer.addresses.map((address) => (
                          <Card key={address.id} className="p-4 space-y-2 relative">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm">{address.recipientName}</span>
                              <div className="flex gap-1.5">
                                {address.label && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {address.label}
                                  </Badge>
                                )}
                                {address.isDefault && (
                                  <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                                    {t('defaultBadge')}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">{address.phone}</p>
                            <p className="text-xs text-foreground/80 mt-1">
                              {address.streetAddress}, {address.upazila}, {address.districtId},{' '}
                              {address.divisionId}{' '}
                              {address.postalCode ? `- ${address.postalCode}` : ''}
                            </p>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'orders' && (
                  <div className="space-y-3">
                    {customer.recentOrders.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground text-sm">
                        <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        {t('noOrders')}
                      </div>
                    ) : (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-muted/50 border-b font-medium text-muted-foreground">
                            <tr>
                              <th className="p-3">{t('table.orderNumber')}</th>
                              <th className="p-3">{t('table.date')}</th>
                              <th className="p-3">{t('table.status')}</th>
                              <th className="p-3">{t('table.payment')}</th>
                              <th className="p-3 text-right">{t('table.total')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {customer.recentOrders.map((ord) => (
                              <tr key={ord.id} className="hover:bg-muted/20">
                                <td className="p-3 font-mono font-medium">{ord.orderNumber}</td>
                                <td className="p-3 text-muted-foreground">
                                  {formatDate(ord.createdAt)}
                                </td>
                                <td className="p-3">
                                  <Badge variant="outline" className="text-[10px]">
                                    {ord.status}
                                  </Badge>
                                </td>
                                <td className="p-3">
                                  <span className="font-medium">{ord.paymentMethod}</span> (
                                  <span
                                    className={
                                      ord.paymentStatus === 'PAID'
                                        ? 'text-emerald-600 font-medium'
                                        : 'text-muted-foreground'
                                    }
                                  >
                                    {ord.paymentStatus}
                                  </span>
                                  )
                                </td>
                                <td className="p-3 text-right font-medium">
                                  {formatCurrency(ord.totalPayable)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'returns' && (
                  <div className="space-y-3">
                    {customer.recentReturns.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground text-sm">
                        <RotateCcw className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        {t('noReturns')}
                      </div>
                    ) : (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-muted/50 border-b font-medium text-muted-foreground">
                            <tr>
                              <th className="p-3">{t('table.returnNumber')}</th>
                              <th className="p-3">{t('table.orderNumber')}</th>
                              <th className="p-3">{t('table.status')}</th>
                              <th className="p-3">{t('table.reason')}</th>
                              <th className="p-3 text-right">{t('table.refundAmount')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {customer.recentReturns.map((ret) => (
                              <tr key={ret.id} className="hover:bg-muted/20">
                                <td className="p-3 font-mono font-medium">{ret.returnNumber}</td>
                                <td className="p-3 font-mono text-muted-foreground">
                                  {ret.orderNumber}
                                </td>
                                <td className="p-3">
                                  <Badge
                                    variant="outline"
                                    className={
                                      ret.status === 'COMPLETED'
                                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                                        : ''
                                    }
                                  >
                                    {ret.status}
                                  </Badge>
                                </td>
                                <td className="p-3 max-w-[200px] truncate text-muted-foreground">
                                  {ret.customerReason}
                                </td>
                                <td className="p-3 text-right font-medium">
                                  {ret.actualRefundAmount !== null
                                    ? formatCurrency(ret.actualRefundAmount)
                                    : `${formatCurrency(ret.estimatedRefundAmount)} (est)`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Status Change Dialog */}
      {customer && (
        <CustomerStatusDialog
          customerId={customer.id}
          customerName={fullName}
          currentStatus={customer.status}
          targetStatus={customer.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'}
          isOpen={isStatusDialogOpen}
          onClose={() => setIsStatusDialogOpen(false)}
          onSuccess={handleStatusDialogSuccess}
        />
      )}
    </>
  );
}
