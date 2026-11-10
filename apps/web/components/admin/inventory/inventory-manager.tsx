'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import {
  Boxes,
  Package,
  AlertTriangle,
  XCircle,
  Search,
  RefreshCw,
  SlidersHorizontal,
  History,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowUpDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StockAdjustmentModal } from './stock-adjustment-modal';
import { StockHistoryModal } from './stock-history-modal';
import type { CategoryItem, InventoryListItem, InventorySummary } from '@/lib/catalogue-types';

export function InventoryManager() {
  const t = useTranslations('admin.inventory');

  // Inventory data state
  const [items, setItems] = useState<InventoryListItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary>({
    totalTrackedVariants: 0,
    totalOnHandUnits: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
  });
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [stockStatus, setStockStatus] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>(
    'all',
  );
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState('updated_at_desc');

  // Notifications
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Modals state
  const [adjustmentItem, setAdjustmentItem] = useState<InventoryListItem | null>(null);
  const [historyTarget, setHistoryTarget] = useState<InventoryListItem | null>(null);

  // Load Categories for filter
  useEffect(() => {
    fetch('/api/admin/categories')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setCategories(data.data);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch Inventory items for manual refresh
  const loadInventory = useCallback(async () => {
    setIsLoading(true);
    setFeedbackError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (categoryFilter) params.set('categoryId', categoryFilter);
      if (stockStatus !== 'all') params.set('stockStatus', stockStatus);
      if (sortBy) params.set('sortBy', sortBy);

      const res = await fetch(`/api/admin/inventory?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || t('errors.loadFailed'));
      }

      setItems(data.data.items || []);
      setTotalPages(data.data.pagination?.totalPages || 1);
      setTotalCount(data.data.pagination?.total || 0);
      if (data.data.summary) {
        setSummary(data.data.summary);
      }
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : t('errors.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [page, searchTerm, categoryFilter, stockStatus, sortBy, t]);

  useEffect(() => {
    let ignore = false;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '20');
    if (searchTerm.trim()) params.set('search', searchTerm.trim());
    if (categoryFilter) params.set('categoryId', categoryFilter);
    if (stockStatus !== 'all') params.set('stockStatus', stockStatus);
    if (sortBy) params.set('sortBy', sortBy);

    fetch(`/api/admin/inventory?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (!ignore && data.success) {
          setItems(data.data.items || []);
          setTotalPages(data.data.pagination?.totalPages || 1);
          setTotalCount(data.data.pagination?.total || 0);
          if (data.data.summary) {
            setSummary(data.data.summary);
          }
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setFeedbackError(err instanceof Error ? err.message : t('errors.loadFailed'));
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [page, searchTerm, categoryFilter, stockStatus, sortBy, t]);

  const handleAdjustmentSuccess = (msg: string) => {
    setFeedbackSuccess(msg);
    loadInventory();
    setTimeout(() => setFeedbackSuccess(null), 5000);
  };

  const getStockBadge = (item: InventoryListItem) => {
    if (item.isOutOfStock) {
      return (
        <Badge variant="destructive" className="font-semibold text-xs">
          {t('status.outOfStock')}
        </Badge>
      );
    }
    if (item.isLowStock) {
      return (
        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400 font-semibold text-xs">
          {t('status.lowStock')}
        </Badge>
      );
    }
    return (
      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400 font-semibold text-xs">
        {t('status.inStock')}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Boxes className="w-7 h-7 text-primary" />
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('description')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadInventory}
          disabled={isLoading}
          className="flex items-center gap-1.5"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      {/* Operational Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">
              {t('metrics.totalVariants')}
            </span>
            <Package className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-bold text-foreground mt-2">{summary.totalTrackedVariants}</p>
          <span className="text-xs text-muted-foreground mt-0.5 block">
            {t('metrics.variantsDesc')}
          </span>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">
              {t('metrics.totalUnits')}
            </span>
            <Boxes className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-foreground mt-2">
            {summary.totalOnHandUnits.toLocaleString()}
          </p>
          <span className="text-xs text-muted-foreground mt-0.5 block">
            {t('metrics.unitsDesc')}
          </span>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-amber-500">
            <span className="text-xs font-medium uppercase tracking-wider">
              {t('metrics.lowStock')}
            </span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-foreground mt-2">{summary.lowStockCount}</p>
          <span className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5 block">
            {t('metrics.lowStockDesc')}
          </span>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-destructive">
            <span className="text-xs font-medium uppercase tracking-wider">
              {t('metrics.outOfStock')}
            </span>
            <XCircle className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-foreground mt-2">{summary.outOfStockCount}</p>
          <span className="text-xs text-destructive/80 mt-0.5 block">
            {t('metrics.outOfStockDesc')}
          </span>
        </div>
      </div>

      {/* Feedback Messages */}
      {feedbackSuccess && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{feedbackSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackSuccess(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            &times;
          </button>
        </div>
      )}

      {feedbackError && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{feedbackError}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackError(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            &times;
          </button>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="pl-9 text-sm"
            />
          </div>

          {/* Stock Status Selector */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {(
              [
                { key: 'all', label: t('filters.all') },
                { key: 'in_stock', label: t('filters.inStock') },
                { key: 'low_stock', label: t('filters.lowStock') },
                { key: 'out_of_stock', label: t('filters.outOfStock') },
              ] as const
            ).map((status) => (
              <Button
                key={status.key}
                type="button"
                variant={stockStatus === status.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setStockStatus(status.key);
                  setPage(1);
                }}
                className="text-xs whitespace-nowrap"
              >
                {status.label}
              </Button>
            ))}
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-background border border-input rounded-md text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">{t('filters.allCategories')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-background border border-input rounded-md text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="updated_at_desc">{t('sort.recent')}</option>
            <option value="stock_desc">{t('sort.stockHighToLow')}</option>
            <option value="stock_asc">{t('sort.stockLowToHigh')}</option>
            <option value="name_asc">{t('sort.nameAsc')}</option>
            <option value="sku_asc">{t('sort.skuAsc')}</option>
          </select>
        </div>
      </div>

      {/* Main Inventory Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {isLoading && items.length === 0 ? (
          <div className="py-24 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-medium">{t('loading')}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            <Boxes className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-base font-semibold text-foreground">{t('empty.title')}</p>
            <p className="text-sm mt-1">{t('empty.desc')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4 font-semibold">{t('table.product')}</th>
                  <th className="py-3 px-4 font-semibold">{t('table.sku')}</th>
                  <th className="py-3 px-4 font-semibold text-center">{t('table.onHand')}</th>
                  <th className="py-3 px-4 font-semibold text-center">{t('table.reserved')}</th>
                  <th className="py-3 px-4 font-semibold text-center">{t('table.available')}</th>
                  <th className="py-3 px-4 font-semibold text-center">{t('table.threshold')}</th>
                  <th className="py-3 px-4 font-semibold text-center">{t('table.status')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => {
                  const primaryImg = item.variant.product.images?.[0]?.url;
                  return (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors group">
                      {/* Product & Variant */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-muted border border-border overflow-hidden shrink-0 flex items-center justify-center relative">
                            {primaryImg ? (
                              <Image
                                src={primaryImg}
                                alt={item.variant.product.name}
                                fill
                                className="object-cover"
                                sizes="40px"
                              />
                            ) : (
                              <Package className="w-5 h-5 text-muted-foreground/60" />
                            )}
                          </div>
                          <div>
                            <span className="font-semibold text-foreground text-sm block">
                              {item.variant.product.name}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs text-muted-foreground">
                                {item.variant.name}
                              </span>
                              {item.variant.isDefault && (
                                <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                                  {t('table.defaultBadge')}
                                </Badge>
                              )}
                              <span className="text-[11px] text-muted-foreground/70">
                                • {item.variant.product.category.name}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* SKU */}
                      <td className="py-3.5 px-4 font-mono text-xs text-foreground whitespace-nowrap">
                        {item.variant.sku}
                      </td>

                      {/* On-Hand Physical Stock */}
                      <td className="py-3.5 px-4 text-center font-bold text-foreground">
                        {item.quantity}
                      </td>

                      {/* Reserved Quantity */}
                      <td className="py-3.5 px-4 text-center text-muted-foreground font-medium">
                        {item.reservedQuantity}
                      </td>

                      {/* Available Stock */}
                      <td className="py-3.5 px-4 text-center font-extrabold text-base">
                        <span
                          className={
                            item.available <= 0
                              ? 'text-destructive'
                              : item.isLowStock
                                ? 'text-amber-500'
                                : 'text-emerald-500'
                          }
                        >
                          {item.available}
                        </span>
                      </td>

                      {/* Threshold */}
                      <td className="py-3.5 px-4 text-center text-xs text-muted-foreground">
                        {item.lowStockThreshold ?? 5}
                      </td>

                      {/* Stock Status Badge */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {getStockBadge(item)}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => setAdjustmentItem(item)}
                            className="text-xs h-8 px-2.5 flex items-center gap-1"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            {t('table.adjustButton')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setHistoryTarget(item)}
                            className="text-xs h-8 px-2.5 flex items-center gap-1"
                          >
                            <History className="w-3.5 h-3.5" />
                            {t('table.historyButton')}
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
        <div className="flex items-center justify-between p-4 border-t border-border bg-muted/20">
          <span className="text-xs text-muted-foreground">
            {t('pagination.showing', { count: items.length, total: totalCount })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="text-xs h-8"
            >
              {t('common.prev')}
            </Button>
            <span className="text-xs font-medium text-foreground px-1">
              {t('pagination.page', { page, totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => p + 1)}
              className="text-xs h-8"
            >
              {t('common.next')}
            </Button>
          </div>
        </div>
      </div>

      {/* Stock Adjustment Modal */}
      <StockAdjustmentModal
        open={Boolean(adjustmentItem)}
        item={adjustmentItem}
        onClose={() => setAdjustmentItem(null)}
        onSuccess={handleAdjustmentSuccess}
      />

      {/* Stock History Audit Modal */}
      <StockHistoryModal
        open={Boolean(historyTarget)}
        variantId={historyTarget?.variantId || null}
        variantSku={historyTarget?.variant.sku || ''}
        variantName={historyTarget?.variant.name || ''}
        productName={historyTarget?.variant.product.name || ''}
        onClose={() => setHistoryTarget(null)}
      />
    </div>
  );
}
