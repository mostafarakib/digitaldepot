'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  type ProductListItem,
  type CategoryItem,
  type BrandItem,
  formatBdt,
} from '@/lib/catalogue-types';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ProductModal } from './product-modal';
import { ProductArchiveDialog } from './product-archive-dialog';
import {
  Package,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  Edit,
  Archive,
  Star,
  CheckCircle2,
  AlertCircle,
  ImageIcon,
} from 'lucide-react';

export function ProductManager() {
  const t = useTranslations('admin.products');

  // Data states
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [featuredFilter, setFeaturedFilter] = useState(false);

  // Notification states
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Modal states
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [productToArchive, setProductToArchive] = useState<ProductListItem | null>(null);

  // Load Products (user-invoked refresh)
  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setFeedbackError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '15');
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (categoryFilter) params.set('categoryId', categoryFilter);
      if (brandFilter) params.set('brandId', brandFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (featuredFilter) params.set('featured', 'true');

      const data = await apiClient<ProductListItem[]>(`/api/admin/products?${params.toString()}`);
      setProducts(data);
      setTotalPages(1);
      setTotalCount(data.length);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : t('feedback.genericError'));
    } finally {
      setIsLoading(false);
    }
  }, [page, searchTerm, categoryFilter, brandFilter, statusFilter, featuredFilter, t]);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      apiClient<CategoryItem[]>('/api/admin/categories?limit=100'),
      apiClient<BrandItem[]>('/api/admin/brands?limit=100'),
    ])
      .then(([cats, brs]) => {
        if (!ignore) {
          setCategories(cats);
          setBrands(brs);
        }
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '15');
    if (searchTerm.trim()) params.set('search', searchTerm.trim());
    if (categoryFilter) params.set('categoryId', categoryFilter);
    if (brandFilter) params.set('brandId', brandFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (featuredFilter) params.set('featured', 'true');

    apiClient<ProductListItem[]>(`/api/admin/products?${params.toString()}`)
      .then((data) => {
        if (!ignore) {
          setProducts(data);
          setTotalPages(1);
          setTotalCount(data.length);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setFeedbackError(err instanceof Error ? err.message : t('feedback.genericError'));
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [page, searchTerm, categoryFilter, brandFilter, statusFilter, featuredFilter, t]);

  const handleOpenCreate = () => {
    setSelectedProductId(null);
    setIsProductModalOpen(true);
  };

  const handleOpenEdit = (product: ProductListItem) => {
    setSelectedProductId(product.id);
    setIsProductModalOpen(true);
  };

  const handleOpenArchiveDialog = (product: ProductListItem) => {
    setProductToArchive(product);
    setIsArchiveDialogOpen(true);
  };

  const handleArchiveConfirm = async () => {
    if (!productToArchive) return;
    try {
      await apiClient(`/api/admin/products/${encodeURIComponent(productToArchive.id)}/archive`, {
        method: 'POST',
      });
      setFeedbackSuccess(t('feedback.productArchived'));
      await loadProducts();
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Archive failed');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!productToArchive) return;
    try {
      await apiClient(`/api/admin/products/${encodeURIComponent(productToArchive.id)}`, {
        method: 'DELETE',
      });
      setFeedbackSuccess(t('feedback.productDeleted'));
      await loadProducts();
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Package className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('title')}</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>

        <Button onClick={handleOpenCreate} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          {t('addProduct')}
        </Button>
      </div>

      {/* Notifications */}
      {feedbackSuccess && (
        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{feedbackSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackSuccess(null)}
            className="text-xs hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {feedbackError && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{feedbackError}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackError(null)}
            className="text-xs hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="p-4 rounded-xl bg-card border border-border shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="pl-9"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
            >
              <option value="">{t('filterAllCategories')}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>

            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="h-10 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
            >
              <option value="">{t('filterAllBrands')}</option>
              {brands.map((br) => (
                <option key={br.id} value={br.id}>
                  {br.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
            >
              <option value="">{t('filterAllStatus')}</option>
              <option value="DRAFT">{t('statusDraft')}</option>
              <option value="PUBLISHED">{t('statusPublished')}</option>
              <option value="ARCHIVED">{t('statusArchived')}</option>
            </select>

            <div className="flex items-center justify-between gap-2 px-3 rounded-md border border-input bg-background">
              <span className="text-xs text-muted-foreground">{t('featuredOnly')}</span>
              <input
                type="checkbox"
                checked={featuredFilter}
                onChange={(e) => setFeaturedFilter(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={loadProducts}
            title="Refresh"
            disabled={isLoading}
            className="shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Products Table */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        {isLoading && products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <p className="text-sm">Loading products...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 px-4">
            <Package className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">{t('empty')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground border-b border-border">
                <tr>
                  <th className="p-3.5 font-medium">{t('colProduct')}</th>
                  <th className="p-3.5 font-medium">{t('colCategory')}</th>
                  <th className="p-3.5 font-medium">{t('colPrice')}</th>
                  <th className="p-3.5 font-medium">{t('colVariants')}</th>
                  <th className="p-3.5 font-medium">{t('colStatus')}</th>
                  <th className="p-3.5 font-medium text-right">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map((p) => {
                  const defaultVariant = p.variants?.[0];
                  const primaryImage = p.images?.[0];

                  return (
                    <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                      {/* Product & Thumbnail */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-lg bg-muted border border-border/80 flex items-center justify-center overflow-hidden shrink-0">
                            {primaryImage ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={primaryImage.url}
                                alt={primaryImage.altText || p.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-foreground text-sm truncate">
                                {p.name}
                              </span>
                              {p.featured && (
                                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500 shrink-0" />
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground block truncate font-mono">
                              /{p.slug}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Category & Brand */}
                      <td className="p-3.5 text-xs">
                        <div className="text-foreground font-medium">{p.category?.name}</div>
                        {p.brand && <div className="text-muted-foreground">{p.brand.name}</div>}
                      </td>

                      {/* Price */}
                      <td className="p-3.5">
                        {defaultVariant ? (
                          <div>
                            <span className="font-semibold text-foreground">
                              {formatBdt(defaultVariant.price)}
                            </span>
                            {defaultVariant.compareAtPrice && (
                              <span className="text-xs text-muted-foreground line-through ml-1.5">
                                {formatBdt(defaultVariant.compareAtPrice)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No variant</span>
                        )}
                      </td>

                      {/* Variants Count */}
                      <td className="p-3.5">
                        <Badge variant="outline" className="text-xs">
                          {p._count?.variants ?? p.variants?.length ?? 0} variants
                        </Badge>
                      </td>

                      {/* Status */}
                      <td className="p-3.5">
                        <Badge
                          variant={
                            p.status === 'PUBLISHED'
                              ? 'default'
                              : p.status === 'ARCHIVED'
                                ? 'destructive'
                                : 'secondary'
                          }
                          className="text-xs capitalize"
                        >
                          {p.status.toLowerCase()}
                        </Badge>
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenEdit(p)}
                            className="h-8 px-2 text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"
                          >
                            <Edit className="h-3.5 w-3.5" />
                            {t('edit')}
                          </Button>

                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => handleOpenArchiveDialog(p)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            title={t('archive')}
                          >
                            <Archive className="h-3.5 w-3.5" />
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
      </div>

      {/* Modals */}
      <ProductModal
        key={selectedProductId ?? 'new'}
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        productId={selectedProductId}
        categories={categories}
        brands={brands}
        onSaved={async () => {
          await loadProducts();
        }}
      />

      <ProductArchiveDialog
        isOpen={isArchiveDialogOpen}
        onClose={() => setIsArchiveDialogOpen(false)}
        product={productToArchive}
        onArchive={handleArchiveConfirm}
        onDelete={handleDeleteConfirm}
      />
    </div>
  );
}
