'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import {
  MessageSquare,
  Search,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Star,
  Check,
  X,
  Clock,
  ExternalLink,
  Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { AdminReviewItem, ReviewStatus } from '@/lib/review-types';
import { getAdminReviewsApi, moderateReviewApi, deleteAdminReviewApi } from '@/lib/api-client';

export function ReviewManager() {
  const t = useTranslations('admin.reviews');
  const tCommon = useTranslations('common');

  const [reviews, setReviews] = useState<AdminReviewItem[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>(
    'ALL',
  );

  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Reject modal state
  const [rejectingReview, setRejectingReview] = useState<AdminReviewItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isRejecting, setIsRejecting] = useState<boolean>(false);

  // Delete modal state
  const [deletingReview, setDeletingReview] = useState<AdminReviewItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const fetchReviews = useCallback(async () => {
    setIsLoading(true);
    setFeedbackError(null);
    try {
      const res = await getAdminReviewsApi({
        page,
        limit: 15,
        status: statusFilter,
        search: searchTerm.trim() || '',
      });
      setReviews(res.reviews);
      setPendingCount(res.pendingCount);
      setTotalPages(res.pagination.totalPages);
      setTotalCount(res.pagination.total);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to fetch reviews');
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, searchTerm]);

  useEffect(() => {
    let ignore = false;
    getAdminReviewsApi({
      page,
      limit: 15,
      status: statusFilter,
      search: searchTerm.trim() || '',
    })
      .then((res) => {
        if (!ignore) {
          setReviews(res.reviews);
          setPendingCount(res.pendingCount);
          setTotalPages(res.pagination.totalPages);
          setTotalCount(res.pagination.total);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setFeedbackError(err instanceof Error ? err.message : 'Failed to fetch reviews');
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [page, statusFilter, searchTerm]);

  const handleApprove = async (review: AdminReviewItem) => {
    setFeedbackError(null);
    setFeedbackSuccess(null);
    try {
      await moderateReviewApi(review.id, { status: 'APPROVED' });
      setFeedbackSuccess(t('approvedSuccess'));
      await fetchReviews();
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to approve review');
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingReview) return;
    setIsRejecting(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);
    try {
      await moderateReviewApi(rejectingReview.id, {
        status: 'REJECTED',
        rejectionReason: rejectionReason.trim() ? rejectionReason.trim() : null,
      });
      setFeedbackSuccess(t('rejectedSuccess'));
      setRejectingReview(null);
      setRejectionReason('');
      await fetchReviews();
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to reject review');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingReview) return;
    setIsDeleting(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);
    try {
      await deleteAdminReviewApi(deletingReview.id);
      setFeedbackSuccess(t('deletedSuccess'));
      setDeletingReview(null);
      await fetchReviews();
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to delete review');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <MessageSquare className="size-6 text-blue-500" />
            <span>{t('title')}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t('subtitle')}</p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void fetchReviews()}
          disabled={isLoading}
          className="border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-white"
        >
          <RefreshCw className={`size-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{tCommon('refresh')}</span>
        </Button>
      </div>

      {/* Notifications */}
      {feedbackSuccess && (
        <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{feedbackSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackSuccess(null)}
            className="text-emerald-400 hover:text-emerald-300"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {feedbackError && (
        <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{feedbackError}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackError(null)}
            className="text-rose-400 hover:text-rose-300"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Controls: Search and Status Filters */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        {/* Status Filter Tabs */}
        <div className="flex bg-slate-800/80 p-1 rounded-lg border border-slate-700/80 gap-1 overflow-x-auto">
          {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <span>{t(`status.${st.toLowerCase()}`)}</span>
              {st === 'PENDING' && pendingCount > 0 && (
                <span className="size-4 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder={t('searchPlaceholder')}
            className="pl-9 h-9 text-xs bg-slate-800/60 border-slate-700 text-slate-200 placeholder:text-slate-500 focus-visible:ring-blue-500"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Reviews Table / List */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xs">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="size-8 animate-spin text-blue-500" />
            <p className="text-xs">{tCommon('loading')}</p>
          </div>
        ) : reviews.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center p-4">
            <MessageSquare className="size-10 text-slate-600 mb-2" />
            <h3 className="text-sm font-semibold text-slate-300">{t('noReviewsFound')}</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">{t('noReviewsDescription')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">{t('table.product')}</th>
                  <th className="py-3 px-4">{t('table.customer')}</th>
                  <th className="py-3 px-4">{t('table.rating')}</th>
                  <th className="py-3 px-4">{t('table.review')}</th>
                  <th className="py-3 px-4">{t('table.status')}</th>
                  <th className="py-3 px-4">{t('table.date')}</th>
                  <th className="py-3 px-4 text-right">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {reviews.map((rev) => (
                  <tr key={rev.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Product */}
                    <td className="py-3 px-4 align-top">
                      <div className="flex items-center gap-2.5 max-w-[200px]">
                        <div className="size-10 rounded-lg bg-slate-800 overflow-hidden shrink-0 relative flex items-center justify-center border border-slate-700/60">
                          {rev.product.imageUrl ? (
                            <Image
                              src={rev.product.imageUrl}
                              alt={rev.product.name}
                              fill
                              className="object-contain p-1"
                            />
                          ) : (
                            <Package className="size-5 text-slate-500" />
                          )}
                        </div>
                        <div className="truncate">
                          <a
                            href={`/products/${rev.product.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-slate-200 hover:text-blue-400 transition-colors flex items-center gap-1 truncate"
                            title={rev.product.name}
                          >
                            <span className="truncate">{rev.product.name}</span>
                            <ExternalLink className="size-3 shrink-0 opacity-60" />
                          </a>
                        </div>
                      </div>
                    </td>

                    {/* Customer */}
                    <td className="py-3 px-4 align-top">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-200">{rev.user.name}</span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {rev.user.email}
                        </span>
                      </div>
                    </td>

                    {/* Rating */}
                    <td className="py-3 px-4 align-top">
                      <div className="flex items-center gap-1 text-amber-400">
                        <span className="font-bold">{rev.rating}</span>
                        <div className="flex items-center">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`size-3 ${
                                star <= rev.rating ? 'fill-amber-400' : 'text-slate-700'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </td>

                    {/* Review text */}
                    <td className="py-3 px-4 align-top max-w-xs">
                      {rev.title && (
                        <h4 className="font-semibold text-slate-200 text-xs mb-0.5 truncate">
                          {rev.title}
                        </h4>
                      )}
                      <p className="text-slate-300 text-xs line-clamp-2 leading-relaxed">
                        {rev.comment}
                      </p>
                      {rev.rejectionReason && (
                        <div className="mt-1 text-[11px] text-rose-400 italic">
                          <span>{t('rejectionReason')}: </span>
                          <span>{rev.rejectionReason}</span>
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 align-top">
                      {rev.status === 'PENDING' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
                          <Clock className="size-3" />
                          <span>{t('status.pending')}</span>
                        </span>
                      )}
                      {rev.status === 'APPROVED' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="size-3" />
                          <span>{t('status.approved')}</span>
                        </span>
                      )}
                      {rev.status === 'REJECTED' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full">
                          <AlertCircle className="size-3" />
                          <span>{t('status.rejected')}</span>
                        </span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="py-3 px-4 align-top text-slate-400 whitespace-nowrap text-[11px]">
                      {new Date(rev.createdAt).toLocaleDateString()}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 align-top text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {rev.status !== 'APPROVED' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleApprove(rev)}
                            className="h-7 text-xs border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                            title={t('actions.approve')}
                          >
                            <Check className="size-3.5 mr-1" />
                            <span>{t('actions.approve')}</span>
                          </Button>
                        )}

                        {rev.status !== 'REJECTED' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRejectingReview(rev);
                              setRejectionReason('');
                            }}
                            className="h-7 text-xs border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                            title={t('actions.reject')}
                          >
                            <X className="size-3.5 mr-1" />
                            <span>{t('actions.reject')}</span>
                          </Button>
                        )}

                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeletingReview(rev)}
                          className="h-7 size-7 p-0 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                          title={t('actions.delete')}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-800 text-xs text-slate-400">
            <div>{t('showingTotal', { count: reviews.length, total: totalCount })}</div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-7 text-xs border-slate-700 bg-slate-800 text-slate-300"
              >
                {tCommon('previous')}
              </Button>
              <span className="font-semibold text-slate-200">
                {page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-7 text-xs border-slate-700 bg-slate-800 text-slate-300"
              >
                {tCommon('next')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectingReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-100">{t('rejectDialog.title')}</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('rejectDialog.description')}
            </p>

            <div className="space-y-1">
              <label htmlFor="rejection-reason" className="text-xs font-medium text-slate-300">
                {t('rejectionReason')}{' '}
                <span className="text-slate-500 font-normal">({tCommon('optional')})</span>
              </label>
              <textarea
                id="rejection-reason"
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                maxLength={500}
                placeholder={t('rejectDialog.reasonPlaceholder')}
                className="w-full p-2.5 rounded-lg border border-slate-700 bg-slate-800/80 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isRejecting}
                onClick={() => setRejectingReview(null)}
                className="text-xs border-slate-700 bg-slate-800 text-slate-300"
              >
                {tCommon('cancel')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={isRejecting}
                onClick={() => void handleConfirmReject()}
                className="text-xs"
              >
                {isRejecting ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                <span>{t('actions.reject')}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deletingReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-100">{t('deleteDialog.title')}</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('deleteDialog.description')}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isDeleting}
                onClick={() => setDeletingReview(null)}
                className="text-xs border-slate-700 bg-slate-800 text-slate-300"
              >
                {tCommon('cancel')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={isDeleting}
                onClick={() => void handleConfirmDelete()}
                className="text-xs"
              >
                {isDeleting ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                <span>{t('actions.delete')}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
