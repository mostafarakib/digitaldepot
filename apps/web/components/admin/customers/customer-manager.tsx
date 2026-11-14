'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Users,
  Search,
  RefreshCw,
  Loader2,
  AlertCircle,
  Eye,
  ShieldCheck,
  ShieldAlert,
  ShoppingBag,
  CheckCircle2,
  Ban,
  ArrowUpDown,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type {
  AdminCustomerListItem,
  AdminCustomerListStats,
  CustomerStatus,
} from '@/lib/customer-types';
import { getAdminCustomersApi } from '@/lib/api-client';
import { CustomerDetailModal } from './customer-detail-modal';
import { CustomerStatusDialog } from './customer-status-dialog';

export function CustomerManager() {
  const t = useTranslations('admin.customers');
  const tCommon = useTranslations('common');

  const [customers, setCustomers] = useState<AdminCustomerListItem[]>([]);
  const [stats, setStats] = useState<AdminCustomerListStats>({
    totalCustomers: 0,
    activeCustomers: 0,
    suspendedCustomers: 0,
    verifiedCustomers: 0,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters & Pagination State
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | CustomerStatus>('ALL');
  const [orderFilter, setOrderFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('newest');

  // Modals State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  const [statusDialogCustomer, setStatusDialogCustomer] = useState<{
    id: string;
    name: string;
    currentStatus: CustomerStatus;
    targetStatus: CustomerStatus;
  } | null>(null);

  // Search debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(handler);
  }, [searchTerm]);

  const loadCustomers = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    let minOrders: number | undefined;
    let maxOrders: number | undefined;

    if (orderFilter === 'HAS_ORDERS') {
      minOrders = 1;
    } else if (orderFilter === 'NO_ORDERS') {
      minOrders = 0;
      maxOrders = 0;
    }

    try {
      const res = await getAdminCustomersApi({
        page,
        limit: 20,
        search: debouncedSearch || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        minOrders,
        maxOrders,
        sortBy: sortBy as any,
      });

      setCustomers(res.customers);
      setStats(res.stats);
      setTotalPages(res.pagination.totalPages);
      setTotalCount(res.pagination.total);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('errorLoading'));
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, orderFilter, sortBy, t]);

  useEffect(() => {
    let ignore = false;
    let minOrders: number | undefined;
    let maxOrders: number | undefined;

    if (orderFilter === 'HAS_ORDERS') {
      minOrders = 1;
    } else if (orderFilter === 'NO_ORDERS') {
      minOrders = 0;
      maxOrders = 0;
    }

    getAdminCustomersApi({
      page,
      limit: 20,
      search: debouncedSearch || undefined,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      minOrders,
      maxOrders,
      sortBy: sortBy as any,
    })
      .then((res) => {
        if (!ignore) {
          setCustomers(res.customers);
          setStats(res.stats);
          setTotalPages(res.pagination.totalPages);
          setTotalCount(res.pagination.total);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setErrorMessage(err instanceof Error ? err.message : t('errorLoading'));
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [page, debouncedSearch, statusFilter, orderFilter, sortBy, t]);

  const formatCurrency = (poisha: number) => {
    return `৳${(poisha / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (isoStr: string) => {
    return new Date(isoStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const openCustomerDetail = (id: string) => {
    setSelectedCustomerId(id);
    setIsDetailModalOpen(true);
  };

  const openStatusDialog = (customer: AdminCustomerListItem) => {
    const name = customer.profile
      ? `${customer.profile.firstName} ${customer.profile.lastName}`.trim()
      : customer.email.split('@')[0];

    setStatusDialogCustomer({
      id: customer.id,
      name,
      currentStatus: customer.status,
      targetStatus: customer.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="w-7 h-7 text-primary" />
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('description')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadCustomers()}
          disabled={isLoading}
          className="gap-2 shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          {tCommon('refresh')}
        </Button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-card border">
          <p className="text-xs font-medium text-muted-foreground">{t('stats.total')}</p>
          <p className="text-2xl font-bold mt-1">{stats.totalCustomers}</p>
        </Card>
        <Card className="p-4 bg-emerald-500/5 border-emerald-500/20">
          <p className="text-xs font-medium text-muted-foreground">{t('stats.active')}</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {stats.activeCustomers}
          </p>
        </Card>
        <Card className="p-4 bg-destructive/5 border-destructive/20">
          <p className="text-xs font-medium text-muted-foreground">{t('stats.suspended')}</p>
          <p className="text-2xl font-bold text-destructive mt-1">{stats.suspendedCustomers}</p>
        </Card>
        <Card className="p-4 bg-blue-500/5 border-blue-500/20">
          <p className="text-xs font-medium text-muted-foreground">{t('stats.verified')}</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
            {stats.verifiedCustomers}
          </p>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="pl-9 text-sm"
            />
          </div>

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setPage(1);
            }}
            aria-label={t('filters.status')}
            className="h-9 px-3 rounded-md border text-sm bg-background"
          >
            <option value="ALL">{t('filters.allStatuses')}</option>
            <option value="ACTIVE">{t('filters.activeOnly')}</option>
            <option value="SUSPENDED">{t('filters.suspendedOnly')}</option>
          </select>

          {/* Orders Filter */}
          <select
            value={orderFilter}
            onChange={(e) => {
              setOrderFilter(e.target.value);
              setPage(1);
            }}
            aria-label={t('filters.orders')}
            className="h-9 px-3 rounded-md border text-sm bg-background"
          >
            <option value="ALL">{t('filters.allOrders')}</option>
            <option value="HAS_ORDERS">{t('filters.hasOrders')}</option>
            <option value="NO_ORDERS">{t('filters.noOrders')}</option>
          </select>

          {/* Sorting Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
            aria-label={t('filters.sort')}
            className="h-9 px-3 rounded-md border text-sm bg-background"
          >
            <option value="newest">{t('sort.newest')}</option>
            <option value="oldest">{t('sort.oldest')}</option>
            <option value="nameAsc">{t('sort.nameAsc')}</option>
            <option value="nameDesc">{t('sort.nameDesc')}</option>
            <option value="orderCountDesc">{t('sort.orderCountDesc')}</option>
            <option value="ltvDesc">{t('sort.ltvDesc')}</option>
          </select>
        </div>
      </Card>

      {/* Customer Directory Table */}
      <Card className="overflow-hidden border">
        {errorMessage && (
          <div className="p-4 bg-destructive/10 border-b border-destructive/20 text-destructive text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">{tCommon('loading')}</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-base font-medium">{t('noCustomersFound')}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('adjustFilterTip')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b font-medium text-muted-foreground">
                <tr>
                  <th className="p-3.5">{t('table.customer')}</th>
                  <th className="p-3.5">{t('table.phone')}</th>
                  <th className="p-3.5">{t('table.status')}</th>
                  <th className="p-3.5 text-center">{t('table.orders')}</th>
                  <th className="p-3.5 text-right">{t('table.ltv')}</th>
                  <th className="p-3.5">{t('table.registered')}</th>
                  <th className="p-3.5 text-right">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {customers.map((c) => {
                  const fullName = c.profile
                    ? `${c.profile.firstName} ${c.profile.lastName}`.trim()
                    : c.email.split('@')[0];

                  return (
                    <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                            {fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground text-sm leading-snug">
                              {fullName}
                            </p>
                            <p className="text-xs text-muted-foreground">{c.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="p-3.5 text-muted-foreground">{c.profile?.phone || '—'}</td>

                      <td className="p-3.5">
                        <Badge
                          variant="outline"
                          className={
                            c.status === 'ACTIVE'
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                              : 'bg-destructive/10 text-destructive border-destructive/30'
                          }
                        >
                          {c.status}
                        </Badge>
                      </td>

                      <td className="p-3.5 text-center">
                        <span className="font-medium">{c.orderStats.totalOrderCount}</span>
                        <span className="text-muted-foreground text-[10px] ml-1">
                          ({c.orderStats.completedOrderCount} {t('deliveredShort')})
                        </span>
                      </td>

                      <td className="p-3.5 text-right font-medium">
                        <span className="text-primary font-bold">
                          {formatCurrency(c.financials.lifetimeValue)}
                        </span>
                      </td>

                      <td className="p-3.5 text-muted-foreground">{formatDate(c.createdAt)}</td>

                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openCustomerDetail(c.id)}
                            className="h-7 text-xs gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {t('view')}
                          </Button>

                          <Button
                            size="sm"
                            variant={c.status === 'ACTIVE' ? 'ghost' : 'outline'}
                            onClick={() => openStatusDialog(c)}
                            className="h-7 text-xs px-2"
                            title={
                              c.status === 'ACTIVE' ? t('suspendCustomer') : t('reactivateCustomer')
                            }
                          >
                            {c.status === 'ACTIVE' ? (
                              <Ban className="w-3.5 h-3.5 text-destructive" />
                            ) : (
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {t('pagination.showing', {
                start: (page - 1) * 20 + 1,
                end: Math.min(page * 20, totalCount),
                total: totalCount,
              })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
              >
                {tCommon('previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
              >
                {tCommon('next')}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Customer Detail Modal */}
      <CustomerDetailModal
        customerId={selectedCustomerId}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedCustomerId(null);
        }}
        onCustomerUpdated={() => void loadCustomers()}
      />

      {/* Status Confirmation Dialog */}
      {statusDialogCustomer && (
        <CustomerStatusDialog
          customerId={statusDialogCustomer.id}
          customerName={statusDialogCustomer.name}
          currentStatus={statusDialogCustomer.currentStatus}
          targetStatus={statusDialogCustomer.targetStatus}
          isOpen={!!statusDialogCustomer}
          onClose={() => setStatusDialogCustomer(null)}
          onSuccess={() => void loadCustomers()}
        />
      )}
    </div>
  );
}
