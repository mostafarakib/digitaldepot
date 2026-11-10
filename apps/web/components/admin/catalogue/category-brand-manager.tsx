'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { type CategoryTreeNode, type CategoryItem, type BrandItem } from '@/lib/catalogue-types';
import { apiClient, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { CategoryTree } from './category-tree';
import { CategoryModal } from './category-modal';
import { CategoryDeleteDialog } from './category-delete-dialog';
import { BrandList } from './brand-list';
import { BrandModal } from './brand-modal';
import { BrandDeleteDialog } from './brand-delete-dialog';
import { Tags, Building2, Plus, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export function CategoryBrandManager() {
  const t = useTranslations('admin.catalogue');
  const tFeedback = useTranslations('admin.catalogue.feedback');

  // Tab State
  const [activeTab, setActiveTab] = useState<'categories' | 'brands'>('categories');

  // Data States
  const [categoriesTree, setCategoriesTree] = useState<CategoryTreeNode[]>([]);
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReordering, setIsReordering] = useState(false);

  // Notification States
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Category Modal & Dialog States
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);
  const [preselectedParentId, setPreselectedParentId] = useState<string | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryItem | null>(null);
  const [categoryToDeleteChildCount, setCategoryToDeleteChildCount] = useState(0);
  const [isCategoryDeleteDialogOpen, setIsCategoryDeleteDialogOpen] = useState(false);

  // Brand Modal & Dialog States
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<BrandItem | null>(null);
  const [brandToDelete, setBrandToDelete] = useState<BrandItem | null>(null);
  const [isBrandDeleteDialogOpen, setIsBrandDeleteDialogOpen] = useState(false);

  // Brand filters state
  const [brandSearch, setBrandSearch] = useState('');
  const [brandStatusFilter, setBrandStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Data fetchers
  const loadCategories = useCallback(async () => {
    try {
      const data = await apiClient<CategoryTreeNode[]>('/api/admin/categories/tree');
      setCategoriesTree(data);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : tFeedback('genericError'));
    }
  }, [tFeedback]);

  const loadBrands = useCallback(async () => {
    try {
      const data = await apiClient<BrandItem[]>('/api/admin/brands?limit=100');
      setBrands(data);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : tFeedback('genericError'));
    }
  }, [tFeedback]);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    setFeedbackError(null);
    await Promise.all([loadCategories(), loadBrands()]);
    setIsLoading(false);
  }, [loadCategories, loadBrands]);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      apiClient<CategoryTreeNode[]>('/api/admin/categories/tree'),
      apiClient<BrandItem[]>('/api/admin/brands?limit=100'),
    ])
      .then(([cats, brs]) => {
        if (!ignore) {
          setCategoriesTree(cats);
          setBrands(brs);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setFeedbackError(err instanceof Error ? err.message : tFeedback('genericError'));
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [tFeedback]);

  // Temporary feedback dismiss
  useEffect(() => {
    if (feedbackSuccess) {
      const timer = setTimeout(() => setFeedbackSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [feedbackSuccess]);

  // Category Action Handlers
  const handleOpenCreateCategory = (parentId?: string | null) => {
    setSelectedCategory(null);
    setPreselectedParentId(parentId ?? null);
    setIsCategoryModalOpen(true);
  };

  const handleOpenEditCategory = (category: CategoryItem) => {
    setSelectedCategory(category);
    setPreselectedParentId(null);
    setIsCategoryModalOpen(true);
  };

  const handleOpenDeleteCategory = (category: CategoryItem, childCount: number) => {
    setCategoryToDelete(category);
    setCategoryToDeleteChildCount(childCount);
    setIsCategoryDeleteDialogOpen(true);
  };

  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    try {
      await apiClient(`/api/admin/categories/${categoryToDelete.id}`, {
        method: 'DELETE',
      });
      setFeedbackSuccess(tFeedback('categoryDeleted'));
      await loadCategories();
    } catch (err) {
      if (err instanceof ApiError) {
        setFeedbackError(err.message);
      } else {
        setFeedbackError(tFeedback('genericError'));
      }
      throw err;
    }
  };

  const handleReorderCategories = async (items: Array<{ id: string; displayOrder: number }>) => {
    setIsReordering(true);
    try {
      await apiClient('/api/admin/categories/reorder', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      setFeedbackSuccess(tFeedback('categoryReordered'));
      await loadCategories();
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : tFeedback('genericError'));
    } finally {
      setIsReordering(false);
    }
  };

  // Brand Action Handlers
  const handleOpenCreateBrand = () => {
    setSelectedBrand(null);
    setIsBrandModalOpen(true);
  };

  const handleOpenEditBrand = (brand: BrandItem) => {
    setSelectedBrand(brand);
    setIsBrandModalOpen(true);
  };

  const handleOpenDeleteBrand = (brand: BrandItem) => {
    setBrandToDelete(brand);
    setIsBrandDeleteDialogOpen(true);
  };

  const handleConfirmDeleteBrand = async () => {
    if (!brandToDelete) return;
    try {
      await apiClient(`/api/admin/brands/${brandToDelete.id}`, {
        method: 'DELETE',
      });
      setFeedbackSuccess(tFeedback('brandDeleted'));
      await loadBrands();
    } catch (err) {
      if (err instanceof ApiError) {
        setFeedbackError(err.message);
      } else {
        setFeedbackError(tFeedback('genericError'));
      }
      throw err;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Tags className="h-6 w-6 text-primary" />
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('subtitle')}</p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={isLoading}
            className="h-9 gap-1.5"
            title="Refresh catalogue data"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          {activeTab === 'categories' ? (
            <Button
              onClick={() => handleOpenCreateCategory(null)}
              size="sm"
              className="h-9 gap-1.5 shadow-xs"
            >
              <Plus className="h-4 w-4" />
              {t('categories.addCategory')}
            </Button>
          ) : (
            <Button onClick={handleOpenCreateBrand} size="sm" className="h-9 gap-1.5 shadow-xs">
              <Plus className="h-4 w-4" />
              {t('brands.addBrand')}
            </Button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {feedbackSuccess && (
        <div className="p-3.5 rounded-lg border border-primary/20 bg-primary/10 text-primary text-sm flex items-center gap-2.5 shadow-xs">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="flex-1 font-medium">{feedbackSuccess}</span>
        </div>
      )}

      {feedbackError && (
        <div className="p-3.5 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-sm flex items-center gap-2.5 shadow-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1 font-medium">{feedbackError}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="border-b border-border">
        <nav className="flex space-x-6" aria-label="Catalogue tabs">
          <button
            type="button"
            onClick={() => setActiveTab('categories')}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
              activeTab === 'categories'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Tags className="h-4 w-4" />
            {t('tabs.categories')}
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-muted font-normal">
              {categoriesTree.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('brands')}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
              activeTab === 'brands'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Building2 className="h-4 w-4" />
            {t('tabs.brands')}
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-muted font-normal">
              {brands.length}
            </span>
          </button>
        </nav>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm">Loading catalogue structure...</p>
        </div>
      ) : activeTab === 'categories' ? (
        <CategoryTree
          tree={categoriesTree}
          onAddSubcategory={(parentId) => handleOpenCreateCategory(parentId)}
          onEdit={handleOpenEditCategory}
          onDelete={handleOpenDeleteCategory}
          onReorder={handleReorderCategories}
          isReordering={isReordering}
        />
      ) : (
        <BrandList
          brands={brands}
          onEdit={handleOpenEditBrand}
          onDelete={handleOpenDeleteBrand}
          searchQuery={brandSearch}
          onSearchChange={setBrandSearch}
          statusFilter={brandStatusFilter}
          onStatusFilterChange={setBrandStatusFilter}
        />
      )}

      {/* Category Modals */}
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onSuccess={async () => {
          setFeedbackSuccess(
            selectedCategory ? tFeedback('categoryUpdated') : tFeedback('categoryCreated'),
          );
          await loadCategories();
        }}
        initialCategory={selectedCategory}
        tree={categoriesTree}
        preselectedParentId={preselectedParentId}
      />

      <CategoryDeleteDialog
        isOpen={isCategoryDeleteDialogOpen}
        onClose={() => setIsCategoryDeleteDialogOpen(false)}
        onConfirm={handleConfirmDeleteCategory}
        category={categoryToDelete}
        childCount={categoryToDeleteChildCount}
      />

      {/* Brand Modals */}
      <BrandModal
        isOpen={isBrandModalOpen}
        onClose={() => setIsBrandModalOpen(false)}
        onSuccess={async () => {
          setFeedbackSuccess(selectedBrand ? tFeedback('brandUpdated') : tFeedback('brandCreated'));
          await loadBrands();
        }}
        initialBrand={selectedBrand}
      />

      <BrandDeleteDialog
        isOpen={isBrandDeleteDialogOpen}
        onClose={() => setIsBrandDeleteDialogOpen(false)}
        onConfirm={handleConfirmDeleteBrand}
        brand={brandToDelete}
      />
    </div>
  );
}
