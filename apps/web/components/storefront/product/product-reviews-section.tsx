'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/components/auth/auth-provider';
import { Link, usePathname } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { getProductReviewsApi, submitReviewApi, deleteMyReviewApi } from '@/lib/api-client';
import type { ProductReviewsResponse, CreateReviewInput } from '@/lib/review-types';
import {
  Star,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  Edit2,
  Loader2,
  ShieldCheck,
  MessageSquare,
} from 'lucide-react';

interface ProductReviewsSectionProps {
  productSlug: string;
  onReviewCountChange?: (count: number) => void;
}

export function ProductReviewsSection({
  productSlug,
  onReviewCountChange,
}: ProductReviewsSectionProps) {
  const t = useTranslations('reviews');
  const tCommon = useTranslations('common');
  const { user } = useAuth();
  const pathname = usePathname();

  const [data, setData] = useState<ProductReviewsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);

  // Form State
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [title, setTitle] = useState<string>('');
  const [comment, setComment] = useState<string>('');

  const loadReviews = useCallback(async () => {
    try {
      const res = await getProductReviewsApi(productSlug);
      setData(res);
      if (onReviewCountChange) {
        onReviewCountChange(res.summary.reviewCount);
      }
    } catch {
      // Ignore initial fetch errors
    } finally {
      setIsLoading(false);
    }
  }, [productSlug, onReviewCountChange]);

  useEffect(() => {
    let ignore = false;
    getProductReviewsApi(productSlug)
      .then((res) => {
        if (!ignore) {
          setData(res);
          if (onReviewCountChange) {
            onReviewCountChange(res.summary.reviewCount);
          }
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!ignore) {
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [productSlug, onReviewCountChange]);

  const handleOpenEdit = () => {
    if (data?.currentUserReview) {
      setRating(data.currentUserReview.rating);
      setTitle(data.currentUserReview.title || '');
      setComment(data.currentUserReview.comment || '');
    } else {
      setRating(5);
      setTitle('');
      setComment('');
    }
    setErrorMessage(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (comment.trim().length < 5) {
      setErrorMessage(t('commentMinLength'));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const input: CreateReviewInput = {
        rating,
        title: title.trim() ? title.trim() : null,
        comment: comment.trim(),
      };
      await submitReviewApi(productSlug, input);
      setIsFormOpen(false);
      await loadReviews();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to submit review');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('confirmDelete'))) {
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await deleteMyReviewApi(productSlug);
      setIsFormOpen(false);
      await loadReviews();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to delete review');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-xs">{tCommon('loading')}</p>
      </div>
    );
  }

  const summary = data?.summary ?? {
    averageRating: null,
    reviewCount: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  };

  const currentUserReview = data?.currentUserReview ?? null;
  const reviews = data?.reviews ?? [];

  return (
    <div className="space-y-8">
      {/* 1. Rating Summary Header */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 rounded-2xl border border-border bg-muted/10 items-center">
        {/* Left: Overall Score */}
        <div className="md:col-span-4 flex flex-col items-center justify-center text-center p-4 border-b md:border-b-0 md:border-r border-border">
          <div className="text-4xl sm:text-5xl font-extrabold text-foreground tracking-tight mb-1">
            {summary.averageRating !== null ? summary.averageRating.toFixed(1) : '—'}
          </div>
          <div className="flex items-center gap-1 text-amber-500 mb-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`size-4 ${
                  summary.averageRating !== null && star <= Math.round(summary.averageRating)
                    ? 'fill-amber-500 text-amber-500'
                    : 'text-muted-foreground/30'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            {t('basedOnReviews', { count: summary.reviewCount })}
          </span>
        </div>

        {/* Center: Rating Distribution Bars */}
        <div className="md:col-span-5 space-y-2">
          {([5, 4, 3, 2, 1] as const).map((star) => {
            const count = summary.distribution[star] || 0;
            const pct =
              summary.reviewCount > 0 ? Math.round((count / summary.reviewCount) * 100) : 0;

            return (
              <div key={star} className="flex items-center gap-3 text-xs">
                <span className="w-12 text-muted-foreground font-medium flex items-center gap-1">
                  <span>{star}</span>
                  <Star className="size-3 fill-amber-500 text-amber-500" />
                </span>
                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-right text-muted-foreground font-mono text-[11px]">
                  {count}
                </span>
              </div>
            );
          })}
        </div>

        {/* Right: Write Review Trigger */}
        <div className="md:col-span-3 flex flex-col items-center justify-center text-center p-2">
          {user ? (
            !isFormOpen && (
              <Button
                type="button"
                onClick={handleOpenEdit}
                className="w-full text-xs font-semibold"
              >
                <Edit2 className="mr-1.5 size-3.5" />
                <span>{currentUserReview ? t('editReview') : t('writeReview')}</span>
              </Button>
            )
          ) : (
            <div className="space-y-2 text-center">
              <p className="text-xs text-muted-foreground">{t('signInToReview')}</p>
              <Button asChild variant="outline" size="sm" className="w-full text-xs">
                <Link href={`/login?returnUrl=${encodeURIComponent(pathname)}`}>
                  {tCommon('login')}
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Current User Review / Submission Form */}
      {user && currentUserReview && !isFormOpen && (
        <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">{t('yourReview')}</span>
              {currentUserReview.status === 'PENDING' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  <Clock className="size-3" />
                  <span>{t('statusPending')}</span>
                </span>
              )}
              {currentUserReview.status === 'APPROVED' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="size-3" />
                  <span>{t('statusApproved')}</span>
                </span>
              )}
              {currentUserReview.status === 'REJECTED' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20 px-2 py-0.5 rounded-full">
                  <AlertCircle className="size-3" />
                  <span>{t('statusRejected')}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleOpenEdit}
                className="h-7 text-xs"
              >
                <Edit2 className="mr-1 size-3" />
                <span>{t('editReview')}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="h-7 text-xs text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>

          {currentUserReview.status === 'PENDING' && (
            <p className="text-xs text-amber-800 dark:text-amber-200">{t('pendingNotice')}</p>
          )}

          {currentUserReview.status === 'REJECTED' && (
            <p className="text-xs text-rose-800 dark:text-rose-200">
              {t('rejectedNotice', {
                reason: currentUserReview.rejectionReason || 'Violates community guidelines',
              })}
            </p>
          )}

          <div className="flex items-center gap-1 text-amber-500">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`size-3.5 ${
                  star <= currentUserReview.rating ? 'fill-amber-500' : 'text-muted-foreground/30'
                }`}
              />
            ))}
          </div>

          {currentUserReview.title && (
            <h4 className="text-xs font-semibold text-foreground">{currentUserReview.title}</h4>
          )}
          <p className="text-xs text-muted-foreground whitespace-pre-line">
            {currentUserReview.comment}
          </p>
        </div>
      )}

      {/* Review Form (Modal or Inlined) */}
      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          className="p-6 rounded-2xl border border-border bg-card space-y-4 shadow-xs"
        >
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h3 className="text-sm font-bold text-foreground">
              {currentUserReview ? t('editReview') : t('writeReview')}
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsFormOpen(false)}
              className="text-xs"
            >
              {tCommon('cancel')}
            </Button>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Star Rating Picker */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">{t('yourRating')}</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => {
                const filled = star <= (hoverRating || rating);
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 rounded-sm focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer transition-transform hover:scale-110"
                    aria-label={`${star} star`}
                  >
                    <Star
                      className={`size-6 ${
                        filled ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/30'
                      }`}
                    />
                  </button>
                );
              })}
              <span className="ml-2 text-xs font-semibold text-foreground">
                {t('starCount', { star: hoverRating || rating })}
              </span>
            </div>
          </div>

          {/* Title Input */}
          <div className="space-y-1">
            <label htmlFor="review-title" className="text-xs font-medium text-foreground">
              {t('reviewTitle')}{' '}
              <span className="text-muted-foreground font-normal">({tCommon('optional')})</span>
            </label>
            <input
              id="review-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder={t('reviewTitlePlaceholder')}
              className="w-full h-9 px-3 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Comment Textarea */}
          <div className="space-y-1">
            <label htmlFor="review-comment" className="text-xs font-medium text-foreground">
              {t('reviewComment')} *
            </label>
            <textarea
              id="review-comment"
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              minLength={5}
              maxLength={2000}
              required
              placeholder={t('reviewCommentPlaceholder')}
              className="w-full p-3 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{t('minCharsHint')}</span>
              <span>{comment.length}/2000</span>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsFormOpen(false)}
              disabled={isSubmitting}
              className="text-xs"
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting} className="text-xs">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  <span>{tCommon('submitting')}</span>
                </>
              ) : (
                <span>{currentUserReview ? t('updateReview') : t('submitReview')}</span>
              )}
            </Button>
          </div>
        </form>
      )}

      {/* 3. Approved Reviews List */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-foreground">
          {t('customerReviews')} ({summary.reviewCount})
        </h3>

        {reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed border-border bg-muted/5">
            <MessageSquare className="size-10 text-muted-foreground/40 mb-2 stroke-[1.5]" />
            <h4 className="text-sm font-semibold text-foreground mb-1">{t('noReviews')}</h4>
            <p className="text-xs text-muted-foreground max-w-sm mb-4">{t('firstToReview')}</p>
            {user && !currentUserReview && (
              <Button type="button" size="sm" onClick={handleOpenEdit} className="text-xs">
                {t('writeReview')}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4 divide-y divide-border/60">
            {reviews.map((rev) => (
              <div key={rev.id} className="pt-4 first:pt-0 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-foreground">
                      {rev.reviewerName}
                    </span>
                    {rev.isVerifiedPurchase && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        <ShieldCheck className="size-3" />
                        <span>{t('verifiedPurchase')}</span>
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(rev.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Stars */}
                <div className="flex items-center gap-0.5 text-amber-500">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`size-3.5 ${
                        star <= rev.rating ? 'fill-amber-500' : 'text-muted-foreground/30'
                      }`}
                    />
                  ))}
                </div>

                {/* Title & Comment */}
                {rev.title && <h4 className="text-xs font-bold text-foreground">{rev.title}</h4>}
                <p className="text-xs text-foreground/90 whitespace-pre-line leading-relaxed">
                  {rev.comment}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
