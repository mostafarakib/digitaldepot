'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  TicketPercent,
  Search,
  Plus,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Trash2,
  Power,
  Calendar,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { AdminCoupon, CreateCouponInput, UpdateCouponInput } from '@/lib/coupon-types';
import {
  getAdminCouponsApi,
  createAdminCouponApi,
  updateAdminCouponApi,
  deleteAdminCouponApi,
  toggleAdminCouponActiveApi,
} from '@/lib/api-client';
import { CouponModal } from './coupon-modal';
import { CouponDeleteDialog } from './coupon-delete-dialog';

export function CouponManager() {
  const t = useTranslations('admin.coupons');

  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'expired' | 'upcoming' | 'inactive'
  >('all');

  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<AdminCoupon | null>(null);
  const [deletingCoupon, setDeletingCoupon] = useState<AdminCoupon | null>(null);

  const refreshCoupons = useCallback(async () => {
    setIsLoading(true);
    setFeedbackError(null);
    try {
      const res = await getAdminCouponsApi({
        page,
        limit: 15,
        q: searchTerm,
        status: statusFilter,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      setCoupons(res.items);
      setTotalPages(res.pagination.totalPages);
      setTotalCount(res.pagination.total);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to fetch coupons');
    } finally {
      setIsLoading(false);
    }
  }, [page, searchTerm, statusFilter]);

  useEffect(() => {
    let ignore = false;
    getAdminCouponsApi({
      page,
      limit: 15,
      q: searchTerm,
      status: statusFilter,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })
      .then((res) => {
        if (!ignore) {
          setCoupons(res.items);
          setTotalPages(res.pagination.totalPages);
          setTotalCount(res.pagination.total);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setFeedbackError(err instanceof Error ? err.message : 'Failed to fetch coupons');
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [page, searchTerm, statusFilter]);

  const handleCreateOrUpdate = async (input: CreateCouponInput | UpdateCouponInput) => {
    if (editingCoupon) {
      await updateAdminCouponApi(editingCoupon.id, input);
      setFeedbackSuccess(t('updatedSuccess'));
    } else {
      await createAdminCouponApi(input as CreateCouponInput);
      setFeedbackSuccess(t('createdSuccess'));
    }
    await refreshCoupons();
  };

  const handleToggleActive = async (coupon: AdminCoupon) => {
    try {
      await toggleAdminCouponActiveApi(coupon.id);
      setFeedbackSuccess(t('toggledSuccess'));
      await refreshCoupons();
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleDelete = async () => {
    if (!deletingCoupon) return;
    try {
      await deleteAdminCouponApi(deletingCoupon.id);
      setFeedbackSuccess(t('deletedSuccess'));
      await refreshCoupons();
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to delete coupon');
    }
  };

  const getStatusBadge = (coupon: AdminCoupon) => {
    const now = new Date();
    const start = new Date(coupon.startDate);
    const end = new Date(coupon.endDate);

    if (!coupon.isActive) {
      return <Badge variant="secondary">{t('inactive')}</Badge>;
    }
    if (now > end) {
      return <Badge variant="destructive">{t('expired')}</Badge>;
    }
    if (now < start) {
      return (
        <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400">
          {t('upcoming')}
        </Badge>
      );
    }
    return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">{t('active')}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <TicketPercent className="h-7 w-7 text-primary" />
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('description')}</p>
        </div>
        <Button
          onClick={() => {
            setEditingCoupon(null);
            setIsModalOpen(true);
          }}
          className="shrink-0"
        >
          <Plus className="mr-2 h-4 w-4" />
          {t('createButton')}
        </Button>
      </div>

      {/* Notifications */}
      {feedbackSuccess && (
        <div className="flex items-center justify-between p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{feedbackSuccess}</span>
          </div>
          <button
            onClick={() => setFeedbackSuccess(null)}
            className="text-xs font-semibold hover:underline"
          >
            ×
          </button>
        </div>
      )}

      {feedbackError && (
        <div className="flex items-center justify-between p-3.5 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{feedbackError}</span>
          </div>
          <button
            onClick={() => setFeedbackError(null)}
            className="text-xs font-semibold hover:underline"
          >
            ×
          </button>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder={t('searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as any);
            setPage(1);
          }}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">{t('statusFilterAll')}</option>
          <option value="active">{t('statusFilterActive')}</option>
          <option value="expired">{t('statusFilterExpired')}</option>
          <option value="upcoming">{t('statusFilterUpcoming')}</option>
          <option value="inactive">{t('statusFilterInactive')}</option>
        </select>
        <Button variant="outline" size="icon" onClick={() => void refreshCoupons()} title="Refresh">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-xs font-semibold uppercase text-muted-foreground border-b border-border">
              <tr>
                <th className="px-4 py-3">{t('codeCol')}</th>
                <th className="px-4 py-3">{t('typeCol')}</th>
                <th className="px-4 py-3">{t('valueCol')}</th>
                <th className="px-4 py-3">{t('validityCol')}</th>
                <th className="px-4 py-3">{t('limitsCol')}</th>
                <th className="px-4 py-3">{t('statusCol')}</th>
                <th className="px-4 py-3 text-right">{t('actionsCol')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />
                    <span>Loading...</span>
                  </td>
                </tr>
              ) : coupons.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <TicketPercent className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p className="font-medium text-foreground">{t('emptyTitle')}</p>
                    <p className="text-xs mt-1">{t('emptyDescription')}</p>
                  </td>
                </tr>
              ) : (
                coupons.map((coupon) => (
                  <tr key={coupon.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold tracking-wider text-primary">
                          {coupon.code}
                        </span>
                      </div>
                      {coupon.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {coupon.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">
                        {coupon.discountType === 'PERCENTAGE' ? t('percentage') : t('fixedAmount')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {coupon.discountType === 'PERCENTAGE' ? (
                        <div>
                          <span>{coupon.discountValue}%</span>
                          {coupon.maxDiscountAmount && (
                            <p className="text-[11px] text-muted-foreground font-normal">
                              {t('maxDiscount', {
                                amount: (coupon.maxDiscountAmount / 100).toLocaleString(),
                              })}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span>৳{(coupon.discountValue / 100).toLocaleString()}</span>
                      )}
                      {coupon.minOrderAmount && (
                        <p className="text-[11px] text-muted-foreground font-normal">
                          {t('minOrder', {
                            amount: (coupon.minOrderAmount / 100).toLocaleString(),
                          })}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {new Date(coupon.startDate).toLocaleDateString()} –{' '}
                          {new Date(coupon.endDate).toLocaleDateString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {coupon.usageLimit
                            ? t('usagesCountWithLimit', {
                                count: coupon.usageCount,
                                limit: coupon.usageLimit,
                              })
                            : t('usagesCount', { count: coupon.usageCount })}
                        </span>
                      </div>
                      {coupon.perCustomerLimit && (
                        <p className="text-[11px] mt-0.5">
                          {t('perCustomer', { limit: coupon.perCustomerLimit })}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(coupon)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void handleToggleActive(coupon)}
                          title={t('toggleActive')}
                          className="h-8 w-8"
                        >
                          <Power
                            className={`h-4 w-4 ${
                              coupon.isActive ? 'text-emerald-600' : 'text-muted-foreground'
                            }`}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingCoupon(coupon);
                            setIsModalOpen(true);
                          }}
                          title={t('editCoupon')}
                          className="h-8 w-8"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingCoupon(coupon)}
                          title={t('deleteCoupon')}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            <span>
              Showing {coupons.length} of {totalCount} coupons
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <span className="font-medium">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {isModalOpen && (
        <CouponModal
          key={editingCoupon ? editingCoupon.id : 'create'}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingCoupon(null);
          }}
          onSubmit={handleCreateOrUpdate}
          coupon={editingCoupon}
        />
      )}

      <CouponDeleteDialog
        isOpen={Boolean(deletingCoupon)}
        onClose={() => setDeletingCoupon(null)}
        onConfirm={handleDelete}
        coupon={deletingCoupon}
      />
    </div>
  );
}
