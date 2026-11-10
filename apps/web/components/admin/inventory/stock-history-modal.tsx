'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { X, History, Loader2, Calendar, User, ArrowRight, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { InventoryAdjustmentItem, InventoryAdjustmentType } from '@/lib/catalogue-types';

interface StockHistoryModalProps {
  open: boolean;
  variantId: string | null;
  variantSku: string;
  variantName: string;
  productName: string;
  onClose: () => void;
}

export function StockHistoryModal({
  open,
  variantId,
  variantSku,
  variantName,
  productName,
  onClose,
}: StockHistoryModalProps) {
  const t = useTranslations('admin.inventory');

  const [adjustments, setAdjustments] = useState<InventoryAdjustmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (!open || !variantId) return;

    let ignore = false;
    fetch(`/api/admin/inventory/${encodeURIComponent(variantId)}/history?page=${page}&limit=10`)
      .then((res) => res.json())
      .then((data) => {
        if (!ignore && data.success) {
          setAdjustments(data.data.adjustments || []);
          setTotalPages(data.data.pagination?.totalPages || 1);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : t('historyModal.error'));
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [open, variantId, page, t]);

  const handleClose = () => {
    setAdjustments([]);
    setPage(1);
    setError(null);
    onClose();
  };

  if (!open || !variantId) return null;

  const getTypeBadge = (type: InventoryAdjustmentType) => {
    switch (type) {
      case 'RECEIVE':
        return (
          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
            {t('types.RECEIVE')}
          </Badge>
        );
      case 'RETURN_RESTOCK':
        return (
          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">
            {t('types.RETURN_RESTOCK')}
          </Badge>
        );
      case 'CORRECTION':
        return (
          <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">
            {t('types.CORRECTION')}
          </Badge>
        );
      case 'DAMAGE':
        return (
          <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
            {t('types.DAMAGE')}
          </Badge>
        );
      case 'THEFT_LOSS':
        return (
          <Badge className="bg-destructive/10 text-destructive border-destructive/20">
            {t('types.THEFT_LOSS')}
          </Badge>
        );
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-background border border-border rounded-xl shadow-2xl p-6 sm:p-8 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {t('historyModal.title')}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {productName} — <span className="font-semibold text-foreground">{variantName}</span>{' '}
                ({variantSku})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-4">
          {isLoading ? (
            <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-sm">{t('historyModal.loading')}</p>
            </div>
          ) : error ? (
            <div className="py-8 text-center text-destructive text-sm">{error}</div>
          ) : adjustments.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('historyModal.empty')}</p>
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4 font-semibold">{t('historyModal.cols.date')}</th>
                    <th className="py-3 px-4 font-semibold">{t('historyModal.cols.type')}</th>
                    <th className="py-3 px-4 font-semibold text-right">
                      {t('historyModal.cols.change')}
                    </th>
                    <th className="py-3 px-4 font-semibold text-center">
                      {t('historyModal.cols.transition')}
                    </th>
                    <th className="py-3 px-4 font-semibold">{t('historyModal.cols.reason')}</th>
                    <th className="py-3 px-4 font-semibold">{t('historyModal.cols.by')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {adjustments.map((adj) => {
                    const isPositive = adj.quantityDelta > 0;
                    return (
                      <tr key={adj.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 opacity-60" />
                            {new Date(adj.createdAt).toLocaleString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">{getTypeBadge(adj.type)}</td>
                        <td className="py-3 px-4 text-right whitespace-nowrap font-semibold">
                          <span
                            className={`inline-flex items-center gap-0.5 ${
                              isPositive ? 'text-emerald-500' : 'text-destructive'
                            }`}
                          >
                            {isPositive ? (
                              <Plus className="w-3.5 h-3.5" />
                            ) : (
                              <Minus className="w-3.5 h-3.5" />
                            )}
                            {Math.abs(adj.quantityDelta)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            {adj.oldQuantity}
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span className="font-bold">{adj.newQuantity}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-foreground max-w-xs break-words">
                          {adj.reason}
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3 opacity-60" />
                            {adj.adjustedByUser
                              ? adj.adjustedByUser.profile?.firstName
                                ? `${adj.adjustedByUser.profile.firstName} ${adj.adjustedByUser.profile.lastName || ''}`.trim()
                                : adj.adjustedByUser.email
                              : t('historyModal.system')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer / Pagination */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="text-xs text-muted-foreground">
            {totalPages > 1 && <span>{t('historyModal.page', { page, totalPages })}</span>}
          </div>
          <div className="flex items-center gap-2">
            {totalPages > 1 && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('common.prev')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || isLoading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('common.next')}
                </Button>
              </>
            )}
            <Button type="button" variant="secondary" onClick={handleClose}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
