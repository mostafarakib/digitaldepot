'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { type ProductVariantItem, type PriceHistoryItem, formatBdt } from '@/lib/catalogue-types';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { History, X, Loader2, ArrowRight } from 'lucide-react';

interface PriceHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  variant: ProductVariantItem | null;
}

export function PriceHistoryModal({ isOpen, onClose, variant }: PriceHistoryModalProps) {
  const t = useTranslations('admin.products.priceHistoryModal');
  const [history, setHistory] = useState<PriceHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setHistory([]);
    setError(null);
    onClose();
  };

  useEffect(() => {
    if (!isOpen || !variant) return;

    let ignore = false;
    apiClient<PriceHistoryItem[]>(
      `/api/admin/variants/${encodeURIComponent(variant.id)}/price-history`,
    )
      .then((data) => {
        if (!ignore) {
          setHistory(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to load price history');
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [isOpen, variant]);

  if (!isOpen || !variant) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="price-history-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-background border border-border rounded-xl shadow-2xl p-6 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 id="price-history-title" className="text-lg font-semibold text-foreground">
                {t('title', { sku: variant.sku })}
              </h3>
              <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-2" />
              <p className="text-sm">Loading price history...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No price change records found.
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((record) => (
                <div
                  key={record.id}
                  className="p-3.5 rounded-lg border border-border/80 bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4 mb-1.5">
                    <div className="flex items-center gap-2 font-medium text-sm">
                      <span className="text-muted-foreground">
                        {record.oldPrice === 0 ? 'Initial' : formatBdt(record.oldPrice)}
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground font-semibold">
                        {formatBdt(record.newPrice)}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(record.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {record.changedByUser && (
                      <span>
                        Changed by:{' '}
                        <strong className="text-foreground font-medium">
                          {record.changedByUser.profile?.firstName
                            ? `${record.changedByUser.profile.firstName} ${record.changedByUser.profile.lastName || ''}`.trim()
                            : record.changedByUser.email}
                        </strong>
                      </span>
                    )}
                    {record.reason && (
                      <span className="italic">Reason: &ldquo;{record.reason}&rdquo;</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t border-border">
          <Button type="button" variant="outline" onClick={handleClose}>
            {t('close')}
          </Button>
        </div>
      </div>
    </div>
  );
}
