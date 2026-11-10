'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  type ProductDetailItem,
  type ProductListItem,
  type ProductVariantItem,
  type ProductImageItem,
  type CategoryItem,
  type BrandItem,
  type ProductSpecification,
  slugify,
  formatBdt,
  bdtToPoisha,
  poishaToBdt,
} from '@/lib/catalogue-types';
import { apiClient, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { VariantModal } from './variant-modal';
import { PriceHistoryModal } from './price-history-modal';
import {
  Package,
  Layers,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  X,
  Plus,
  Trash2,
  Edit,
  History,
  Star,
  Loader2,
  AlertCircle,
  UploadCloud,
} from 'lucide-react';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string | null;
  categories: CategoryItem[];
  brands: BrandItem[];
  onSaved: (saved: ProductListItem | ProductDetailItem) => void;
}

export function ProductModal({
  isOpen,
  onClose,
  productId,
  categories,
  brands,
  onSaved,
}: ProductModalProps) {
  const t = useTranslations('admin.products');
  const tModal = useTranslations('admin.products.modal');
  const tSpecs = useTranslations('admin.products.specifications');
  const tVariants = useTranslations('admin.products.variants');
  const tImages = useTranslations('admin.products.images');
  const tGate = useTranslations('admin.products.publicationGate');

  const isEditing = Boolean(productId);

  // Tab state
  const [activeTab, setActiveTab] = useState<
    'details' | 'specs' | 'variants' | 'images' | 'publish'
  >('details');

  // Loading & error states
  const [isLoadingProduct, setIsLoadingProduct] = useState(Boolean(productId));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form Fields - Details
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [categoryId, setCategoryId] = useState(categories.length > 0 ? categories[0].id : '');
  const [brandId, setBrandId] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [warranty, setWarranty] = useState('');
  const [featured, setFeatured] = useState(false);
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>('DRAFT');

  // Creation-only initial variant fields
  const [initialSku, setInitialSku] = useState('');
  const [initialPriceBdt, setInitialPriceBdt] = useState('');

  // Specifications
  const [specifications, setSpecifications] = useState<ProductSpecification[]>([]);

  // Editing-only relation data
  const [variants, setVariants] = useState<ProductVariantItem[]>([]);
  const [images, setImages] = useState<ProductImageItem[]>([]);

  // Sub-modals
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariantItem | null>(null);
  const [isPriceHistoryModalOpen, setIsPriceHistoryModalOpen] = useState(false);
  const [historyVariant, setHistoryVariant] = useState<ProductVariantItem | null>(null);

  // Image addition state
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newImageAlt, setNewImageAlt] = useState('');
  const [newImageIsPrimary, setNewImageIsPrimary] = useState(false);
  const [isAddingImage, setIsAddingImage] = useState(false);

  // Publication gate check state
  const [gateCheck, setGateCheck] = useState<{ canPublish: boolean; errors: string[] } | null>(
    null,
  );
  const [isCheckingGate, setIsCheckingGate] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Load product details when editing
  const loadProduct = useCallback(async (id: string) => {
    setIsLoadingProduct(true);
    setServerError(null);
    try {
      const data = await apiClient<ProductDetailItem>(
        `/api/admin/products/${encodeURIComponent(id)}`,
      );
      setName(data.name);
      setSlug(data.slug);
      setCategoryId(data.categoryId);
      setBrandId(data.brandId || '');
      setSummary(data.summary || '');
      setDescription(data.description || '');
      setWarranty(data.warranty || '');
      setFeatured(data.featured);
      setStatus(data.status);
      setSpecifications(data.specifications || []);
      setVariants(data.variants || []);
      setImages(data.images || []);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to load product details');
    } finally {
      setIsLoadingProduct(false);
    }
  }, []);

  const checkPublicationGate = useCallback(async (id: string) => {
    setIsCheckingGate(true);
    try {
      const res = await apiClient<{ canPublish: boolean; errors: string[] }>(
        `/api/admin/products/${encodeURIComponent(id)}/check-publish`,
      );
      setGateCheck(res);
    } catch {
      // Ignore gate check network error
    } finally {
      setIsCheckingGate(false);
    }
  }, []);

  const handleClose = useCallback(() => {
    setActiveTab('details');
    setServerError(null);
    setSuccessMessage(null);
    setGateCheck(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || !productId) return;

    let ignore = false;
    apiClient<ProductDetailItem>(`/api/admin/products/${encodeURIComponent(productId)}`)
      .then((data) => {
        if (!ignore) {
          setName(data.name);
          setSlug(data.slug);
          setCategoryId(data.categoryId);
          setBrandId(data.brandId || '');
          setSummary(data.summary || '');
          setDescription(data.description || '');
          setWarranty(data.warranty || '');
          setFeatured(data.featured);
          setStatus(data.status);
          setSpecifications(data.specifications || []);
          setVariants(data.variants || []);
          setImages(data.images || []);
          setIsLoadingProduct(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setServerError(err instanceof Error ? err.message : 'Failed to load product details');
          setIsLoadingProduct(false);
        }
      });

    apiClient<{ canPublish: boolean; errors: string[] }>(
      `/api/admin/products/${encodeURIComponent(productId)}/check-publish`,
    )
      .then((res) => {
        if (!ignore) setGateCheck(res);
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [isOpen, productId]);

  if (!isOpen) return null;

  // Handle Save (Details & Specifications)
  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setSuccessMessage(null);

    if (!name.trim()) {
      setServerError('Product name is required');
      return;
    }

    if (!categoryId) {
      setServerError('Please select a category');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        slug: slug.trim() ? slugify(slug) : slugify(name),
        categoryId,
        brandId: brandId.trim() ? brandId : null,
        summary: summary.trim() || null,
        description: description.trim() || null,
        warranty: warranty.trim() || null,
        featured,
        specifications: specifications.length > 0 ? specifications : null,
      };

      if (!isEditing && initialPriceBdt.trim()) {
        const parsedPrice = parseFloat(initialPriceBdt);
        if (parsedPrice > 0) {
          payload.initialVariant = {
            sku: initialSku.trim() ? initialSku.trim().toUpperCase() : undefined,
            price: bdtToPoisha(parsedPrice),
          };
        }
      }

      let result: ProductDetailItem;
      if (isEditing && productId) {
        result = await apiClient<ProductDetailItem>(
          `/api/admin/products/${encodeURIComponent(productId)}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          },
        );
        setSuccessMessage(t('feedback.productUpdated'));
      } else {
        result = await apiClient<ProductDetailItem>('/api/admin/products', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setSuccessMessage(t('feedback.productCreated'));
      }

      onSaved(result);

      if (!isEditing) {
        onClose();
      } else if (productId) {
        await loadProduct(productId);
        await checkPublicationGate(productId);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError(err instanceof Error ? err.message : 'Failed to save product');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add Spec Row
  const handleAddSpec = () => {
    setSpecifications((prev) => [...prev, { group: 'General', name: '', value: '' }]);
  };

  const handleUpdateSpec = (index: number, field: keyof ProductSpecification, val: string) => {
    setSpecifications((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  const handleRemoveSpec = (index: number) => {
    setSpecifications((prev) => prev.filter((_, i) => i !== index));
  };

  // Add Image
  const handleAddImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId || !newImageUrl.trim()) return;

    setIsAddingImage(true);
    setServerError(null);
    try {
      await apiClient(`/api/admin/products/${encodeURIComponent(productId)}/images`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: newImageUrl.trim(),
          altText: newImageAlt.trim() || null,
          isPrimary: newImageIsPrimary,
        }),
      });
      setNewImageUrl('');
      setNewImageAlt('');
      setNewImageIsPrimary(false);
      await loadProduct(productId);
      await checkPublicationGate(productId);
      setSuccessMessage(t('feedback.imageAdded'));
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to add image');
    } finally {
      setIsAddingImage(false);
    }
  };

  // Set Primary Image
  const handleSetPrimaryImage = async (imageId: string) => {
    if (!productId) return;
    try {
      await apiClient(
        `/api/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}/primary`,
        { method: 'PATCH' },
      );
      await loadProduct(productId);
      await checkPublicationGate(productId);
      setSuccessMessage(t('feedback.imageSetPrimary'));
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to set primary image');
    }
  };

  // Delete Image
  const handleDeleteImage = async (imageId: string) => {
    if (!productId) return;
    try {
      await apiClient(
        `/api/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
        { method: 'DELETE' },
      );
      await loadProduct(productId);
      await checkPublicationGate(productId);
      setSuccessMessage(t('feedback.imageDeleted'));
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to delete image');
    }
  };

  // Publish from Gate
  const handlePublish = async () => {
    if (!productId) return;
    setIsPublishing(true);
    setServerError(null);
    try {
      const res = await apiClient<ProductDetailItem>(
        `/api/admin/products/${encodeURIComponent(productId)}/publish`,
        { method: 'POST' },
      );
      setStatus('PUBLISHED');
      onSaved(res);
      await loadProduct(productId);
      await checkPublicationGate(productId);
      setSuccessMessage(t('feedback.productPublished'));
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Publication failed');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting && !isPublishing) {
          handleClose();
        }
      }}
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-background border border-border rounded-xl shadow-2xl p-6 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="product-modal-title" className="text-lg font-semibold text-foreground">
                  {isEditing ? tModal('editTitle', { name }) : tModal('createTitle')}
                </h3>
                {isEditing && (
                  <Badge
                    variant={
                      status === 'PUBLISHED'
                        ? 'default'
                        : status === 'ARCHIVED'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {status}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting || isPublishing}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="flex items-center gap-1.5 pt-3 pb-2 border-b border-border overflow-x-auto">
          <Button
            type="button"
            size="sm"
            variant={activeTab === 'details' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('details')}
            className="h-8 text-xs font-medium"
          >
            {tModal('tabDetails')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTab === 'specs' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('specs')}
            className="h-8 text-xs font-medium"
          >
            {tModal('tabSpecifications')} ({specifications.length})
          </Button>

          {isEditing && (
            <>
              <Button
                type="button"
                size="sm"
                variant={activeTab === 'variants' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('variants')}
                className="h-8 text-xs font-medium flex items-center gap-1.5"
              >
                <Layers className="h-3.5 w-3.5" />
                {tModal('tabVariants')} ({variants.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeTab === 'images' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('images')}
                className="h-8 text-xs font-medium flex items-center gap-1.5"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                {tModal('tabImages')} ({images.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeTab === 'publish' ? 'default' : 'ghost'}
                onClick={() => {
                  setActiveTab('publish');
                  if (productId) checkPublicationGate(productId);
                }}
                className="h-8 text-xs font-medium flex items-center gap-1.5"
              >
                {gateCheck?.canPublish ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                )}
                {tModal('tabPublish')}
              </Button>
            </>
          )}
        </div>

        {/* Notifications */}
        {serverError && (
          <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{serverError}</span>
          </div>
        )}
        {successMessage && (
          <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto py-4">
          {isLoadingProduct ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-2" />
              <p className="text-sm">Loading product details...</p>
            </div>
          ) : activeTab === 'details' ? (
            <form id="product-details-form" onSubmit={handleSaveDetails} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="product-name">{tModal('nameLabel')} *</Label>
                  <Input
                    id="product-name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!slug) setSlug(slugify(e.target.value));
                    }}
                    placeholder="e.g. Apple iPhone 16 Pro"
                    disabled={isSubmitting}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="product-slug">{tModal('slugLabel')}</Label>
                  <Input
                    id="product-slug"
                    value={slug}
                    onChange={(e) => setSlug(slugify(e.target.value))}
                    placeholder="e.g. apple-iphone-16-pro"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="product-category">{tModal('categoryLabel')} *</Label>
                  <select
                    id="product-category"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
                    required
                  >
                    <option value="" disabled>
                      {tModal('selectCategory')}
                    </option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} {!cat.isActive && '(Inactive)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="product-brand">{tModal('brandLabel')}</Label>
                  <select
                    id="product-brand"
                    value={brandId}
                    onChange={(e) => setBrandId(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
                  >
                    <option value="">{tModal('selectBrand')}</option>
                    {brands.map((br) => (
                      <option key={br.id} value={br.id}>
                        {br.name} {!br.isActive && '(Inactive)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="product-summary">{tModal('summaryLabel')}</Label>
                <Input
                  id="product-summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="One-line summary for product cards and search results..."
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <Label htmlFor="product-description">{tModal('descriptionLabel')}</Label>
                <textarea
                  id="product-description"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detailed markdown or HTML product description..."
                  disabled={isSubmitting}
                  className="w-full p-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="product-warranty">{tModal('warrantyLabel')}</Label>
                  <Input
                    id="product-warranty"
                    value={warranty}
                    onChange={(e) => setWarranty(e.target.value)}
                    placeholder="e.g. 1 Year Official Manufacturer Warranty"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="product-featured"
                    checked={featured}
                    onChange={(e) => setFeatured(e.target.checked)}
                    disabled={isSubmitting}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <label
                    htmlFor="product-featured"
                    className="text-sm font-medium text-foreground cursor-pointer"
                  >
                    {tModal('featuredLabel')}
                  </label>
                </div>
              </div>

              {!isEditing && (
                <div className="p-4 rounded-lg bg-muted/40 border border-border/80 space-y-3">
                  <h4 className="text-sm font-semibold text-foreground">
                    Initial Variant (Optional)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="initial-sku">{tModal('initialSkuLabel')}</Label>
                      <Input
                        id="initial-sku"
                        value={initialSku}
                        onChange={(e) => setInitialSku(e.target.value.toUpperCase())}
                        placeholder="e.g. IPH16P-DEF"
                        disabled={isSubmitting}
                        className="font-mono"
                      />
                    </div>
                    <div>
                      <Label htmlFor="initial-price">{tModal('initialPriceLabel')}</Label>
                      <Input
                        id="initial-price"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={initialPriceBdt}
                        onChange={(e) => setInitialPriceBdt(e.target.value)}
                        placeholder="e.g. 159999.00"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </div>
              )}
            </form>
          ) : activeTab === 'specs' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">{tSpecs('title')}</h4>
                  <p className="text-xs text-muted-foreground">{tSpecs('empty')}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddSpec}
                  className="h-8"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {tSpecs('addGroup')}
                </Button>
              </div>

              {specifications.length === 0 ? (
                <div className="text-center py-10 rounded-lg border border-dashed border-border text-muted-foreground text-sm">
                  {tSpecs('empty')}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {specifications.map((spec, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={spec.group}
                        onChange={(e) => handleUpdateSpec(idx, 'group', e.target.value)}
                        placeholder="Group (e.g. Display)"
                        className="w-1/4 text-xs"
                      />
                      <Input
                        value={spec.name}
                        onChange={(e) => handleUpdateSpec(idx, 'name', e.target.value)}
                        placeholder="Name (e.g. Screen Size)"
                        className="w-1/3 text-xs"
                      />
                      <Input
                        value={spec.value}
                        onChange={(e) => handleUpdateSpec(idx, 'value', e.target.value)}
                        placeholder="Value (e.g. 6.3-inch OLED)"
                        className="flex-1 text-xs"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleRemoveSpec(idx)}
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'variants' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">{tVariants('title')}</h4>
                  <p className="text-xs text-muted-foreground">{tVariants('empty')}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setSelectedVariant(null);
                    setIsVariantModalOpen(true);
                  }}
                  className="h-8"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {tVariants('addVariant')}
                </Button>
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground border-b border-border">
                    <tr>
                      <th className="p-3 font-medium">{tVariants('colSku')}</th>
                      <th className="p-3 font-medium">{tVariants('colName')}</th>
                      <th className="p-3 font-medium">{tVariants('colPrice')}</th>
                      <th className="p-3 font-medium">{tVariants('colDefault')}</th>
                      <th className="p-3 font-medium">{tVariants('colStatus')}</th>
                      <th className="p-3 font-medium text-right">
                        {tModal('tabVariants')} Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {variants.map((v) => (
                      <tr key={v.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-mono font-medium text-xs text-foreground">
                          {v.sku}
                        </td>
                        <td className="p-3 text-foreground">{v.name}</td>
                        <td className="p-3 font-semibold text-foreground">
                          {formatBdt(v.price)}
                          {v.compareAtPrice && (
                            <span className="text-xs text-muted-foreground line-through ml-1.5 font-normal">
                              {formatBdt(v.compareAtPrice)}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {v.isDefault ? (
                            <Badge variant="default" className="text-xs">
                              Default
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-3">
                          <Badge variant={v.isActive ? 'outline' : 'secondary'} className="text-xs">
                            {v.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setHistoryVariant(v);
                                setIsPriceHistoryModalOpen(true);
                              }}
                              title={tVariants('priceHistory')}
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setSelectedVariant(v);
                                setIsVariantModalOpen(true);
                              }}
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={async () => {
                                if (confirm(`Delete variant ${v.sku}?`)) {
                                  try {
                                    await apiClient(
                                      `/api/admin/variants/${encodeURIComponent(v.id)}`,
                                      {
                                        method: 'DELETE',
                                      },
                                    );
                                    if (productId) {
                                      await loadProduct(productId);
                                      await checkPublicationGate(productId);
                                    }
                                  } catch (err) {
                                    setServerError(
                                      err instanceof Error ? err.message : 'Delete failed',
                                    );
                                  }
                                }
                              }}
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'images' ? (
            <div className="space-y-4">
              <form
                onSubmit={handleAddImage}
                className="p-4 rounded-lg bg-muted/40 border border-border space-y-3"
              >
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <UploadCloud className="h-4 w-4" />
                  {tImages('addImage')}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="image-url">{tImages('urlLabel')} *</Label>
                    <Input
                      id="image-url"
                      value={newImageUrl}
                      onChange={(e) => setNewImageUrl(e.target.value)}
                      placeholder="https://res.cloudinary.com/..."
                      disabled={isAddingImage}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="image-alt">{tImages('altTextLabel')}</Label>
                    <Input
                      id="image-alt"
                      value={newImageAlt}
                      onChange={(e) => setNewImageAlt(e.target.value)}
                      placeholder="e.g. Front angled view in titanium"
                      disabled={isAddingImage}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="image-is-primary"
                      checked={newImageIsPrimary}
                      onChange={(e) => setNewImageIsPrimary(e.target.checked)}
                      disabled={isAddingImage}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <label
                      htmlFor="image-is-primary"
                      className="text-xs text-foreground cursor-pointer"
                    >
                      {tImages('isPrimaryLabel')}
                    </label>
                  </div>

                  <Button type="submit" size="sm" disabled={isAddingImage} className="h-8">
                    {isAddingImage ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {tImages('addImage')}
                  </Button>
                </div>
              </form>

              {images.length === 0 ? (
                <div className="text-center py-10 rounded-lg border border-dashed border-border text-muted-foreground text-sm">
                  {tImages('empty')}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className={`relative group rounded-lg border p-2 bg-card flex flex-col justify-between ${
                        img.isPrimary ? 'border-primary ring-1 ring-primary' : 'border-border'
                      }`}
                    >
                      <div className="aspect-square rounded-md overflow-hidden bg-muted mb-2 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={img.altText || 'Product image'}
                          className="h-full w-full object-cover"
                        />
                      </div>

                      {img.isPrimary && (
                        <span className="absolute top-3 left-3 bg-primary text-primary-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded shadow-xs">
                          {tImages('primaryBadge')}
                        </span>
                      )}

                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-border/60">
                        {!img.isPrimary ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleSetPrimaryImage(img.id)}
                            className="h-7 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                          >
                            <Star className="mr-1 h-3 w-3" />
                            Primary
                          </Button>
                        ) : (
                          <span className="text-[11px] text-primary font-medium px-2">Primary</span>
                        )}

                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteImage(img.id)}
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Publication Gate Tab */
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/40 border border-border">
                <h4 className="text-sm font-semibold text-foreground mb-1">{tGate('title')}</h4>
                <p className="text-xs text-muted-foreground">{tGate('subtitle')}</p>
              </div>

              {isCheckingGate ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span className="text-sm">Verifying publication rules...</span>
                </div>
              ) : gateCheck ? (
                <div className="space-y-4">
                  {gateCheck.canPublish ? (
                    <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                      <div>
                        <h5 className="font-semibold text-sm">
                          All 7 Publication Criteria Satisfied
                        </h5>
                        <p className="text-xs mt-0.5">{tGate('canPublish')}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive space-y-2">
                      <div className="flex items-center gap-2 font-semibold text-sm">
                        <XCircle className="h-5 w-5 shrink-0" />
                        <span>{tGate('cannotPublish')}</span>
                      </div>
                      <ul className="list-disc pl-7 text-xs space-y-1">
                        {gateCheck.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {status === 'PUBLISHED' ? (
                    <div className="p-3 rounded-lg bg-muted/60 text-center text-xs font-medium text-foreground">
                      {tGate('alreadyPublished')}
                    </div>
                  ) : (
                    <div className="flex justify-end pt-2">
                      <Button
                        type="button"
                        onClick={handlePublish}
                        disabled={!gateCheck.canPublish || isPublishing}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {isPublishing ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {tGate('publishing')}
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            {tGate('publishButton')}
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-3 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting || isPublishing}
          >
            {tModal('cancel')}
          </Button>

          {activeTab === 'details' && (
            <Button type="submit" form="product-details-form" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tModal('saving')}
                </>
              ) : (
                tModal('save')
              )}
            </Button>
          )}

          {activeTab === 'specs' && (
            <Button type="button" onClick={handleSaveDetails} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tModal('saving')}
                </>
              ) : (
                tModal('save')
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Sub-modals */}
      {productId && (
        <>
          <VariantModal
            key={selectedVariant?.id ?? 'new'}
            isOpen={isVariantModalOpen}
            onClose={() => setIsVariantModalOpen(false)}
            productId={productId}
            variant={selectedVariant}
            onSaved={async () => {
              await loadProduct(productId);
              await checkPublicationGate(productId);
            }}
          />

          <PriceHistoryModal
            isOpen={isPriceHistoryModalOpen}
            onClose={() => setIsPriceHistoryModalOpen(false)}
            variant={historyVariant}
          />
        </>
      )}
    </div>
  );
}
