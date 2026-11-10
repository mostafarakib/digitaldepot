'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { StorefrontFacets, CategoryTreeNode } from '@/lib/catalogue-types';
import {
  Filter,
  X,
  ChevronDown,
  ChevronRight,
  Check,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';

interface CatalogueFiltersProps {
  categories: CategoryTreeNode[];
  facets: StorefrontFacets;
  selectedCategory?: string;
  selectedBrands: string[];
  minPrice?: number; // in poisha
  maxPrice?: number; // in poisha
  inStockOnly?: boolean;
  onFilterChange: (filters: {
    category?: string;
    brands?: string[];
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    page?: number;
  }) => void;
  onClearAll: () => void;
  className?: string;
}

export function CatalogueFilters({
  categories,
  facets,
  selectedCategory,
  selectedBrands,
  minPrice,
  maxPrice,
  inStockOnly,
  onFilterChange,
  onClearAll,
  className = '',
}: CatalogueFiltersProps) {
  const t = useTranslations('catalogue');

  // Local state for price inputs (in BDT integer)
  const [minPriceInput, setMinPriceInput] = useState<string>(
    minPrice !== undefined ? String(Math.floor(minPrice / 100)) : '',
  );
  const [maxPriceInput, setMaxPriceInput] = useState<string>(
    maxPrice !== undefined ? String(Math.floor(maxPrice / 100)) : '',
  );

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const toggleCategoryExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCategories((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCategoryClick = (slug: string) => {
    if (selectedCategory === slug) {
      onFilterChange({ category: undefined, page: 1 });
    } else {
      onFilterChange({ category: slug, page: 1 });
    }
  };

  const handleBrandToggle = (slug: string) => {
    let next: string[];
    if (selectedBrands.includes(slug)) {
      next = selectedBrands.filter((b) => b !== slug);
    } else {
      next = [...selectedBrands, slug];
    }
    onFilterChange({ brands: next, page: 1 });
  };

  const handleApplyPrice = (e: React.FormEvent) => {
    e.preventDefault();
    const min = minPriceInput ? parseInt(minPriceInput, 10) * 100 : undefined;
    const max = maxPriceInput ? parseInt(maxPriceInput, 10) * 100 : undefined;
    onFilterChange({ minPrice: min, maxPrice: max, page: 1 });
  };

  const handleStockToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({ inStock: e.target.checked || undefined, page: 1 });
  };

  const hasActiveFilters =
    Boolean(selectedCategory) ||
    selectedBrands.length > 0 ||
    minPrice !== undefined ||
    maxPrice !== undefined ||
    Boolean(inStockOnly);

  const renderCategoryNode = (cat: CategoryTreeNode, level = 0) => {
    const isSelected = selectedCategory === cat.slug;
    const hasChildren = cat.children && cat.children.length > 0;
    const isExpanded = expandedCategories[cat.id] ?? false;

    return (
      <div key={cat.id} className="flex flex-col">
        <div
          className={`flex items-center justify-between py-1.5 px-2 rounded-md text-xs cursor-pointer transition-colors ${
            isSelected
              ? 'bg-primary/10 text-primary font-semibold'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
          }`}
          style={{ paddingLeft: `${Math.max(8, level * 16 + 8)}px` }}
          onClick={() => handleCategoryClick(cat.slug)}
        >
          <span className="truncate">{cat.name}</span>
          {hasChildren && (
            <button
              type="button"
              onClick={(e) => toggleCategoryExpand(cat.id, e)}
              className="p-1 hover:text-foreground rounded"
            >
              {isExpanded ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </button>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="flex flex-col space-y-0.5">
            {cat.children.map((child) => renderCategoryNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className={`flex flex-col space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
          <SlidersHorizontal className="size-4" />
          <span>{t('filters.title')}</span>
        </div>
        {hasActiveFilters && (
          <button
            onClick={onClearAll}
            className="text-xs text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
          >
            <RotateCcw className="size-3" />
            <span>{t('filters.clearAll')}</span>
          </button>
        )}
      </div>

      {/* Category Filter */}
      <div className="flex flex-col space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('filters.categories')}
        </h4>
        <div className="flex flex-col space-y-0.5 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
          <div
            className={`flex items-center py-1.5 px-2 rounded-md text-xs cursor-pointer transition-colors ${
              !selectedCategory
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            }`}
            onClick={() => onFilterChange({ category: undefined, page: 1 })}
          >
            <span>{t('filters.allCategories')}</span>
          </div>
          {categories.map((cat) => renderCategoryNode(cat, 0))}
        </div>
      </div>

      {/* Brand Filter */}
      {facets.brands && facets.brands.length > 0 && (
        <div className="flex flex-col space-y-2 pt-4 border-t border-border">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('filters.brands')}
          </h4>
          <div className="flex flex-col space-y-1.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
            {facets.brands.map((b) => {
              const isChecked = selectedBrands.includes(b.slug);
              return (
                <label
                  key={b.id}
                  className="flex items-center justify-between text-xs py-1 px-1.5 rounded hover:bg-muted/40 cursor-pointer select-none text-muted-foreground hover:text-foreground"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleBrandToggle(b.slug)}
                      className="size-3.5 rounded border-input text-primary focus:ring-primary cursor-pointer"
                    />
                    <span>{b.name}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/70">{b.count}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Price Range Filter */}
      <div className="flex flex-col space-y-2.5 pt-4 border-t border-border">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('filters.priceRange')}
        </h4>
        <form onSubmit={handleApplyPrice} className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                ৳
              </span>
              <Input
                type="number"
                placeholder={t('filters.minPrice')}
                value={minPriceInput}
                onChange={(e) => setMinPriceInput(e.target.value)}
                className="h-8 pl-6 text-xs"
                min={0}
              />
            </div>
            <span className="text-xs text-muted-foreground">–</span>
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                ৳
              </span>
              <Input
                type="number"
                placeholder={t('filters.maxPrice')}
                value={maxPriceInput}
                onChange={(e) => setMaxPriceInput(e.target.value)}
                className="h-8 pl-6 text-xs"
                min={0}
              />
            </div>
          </div>
          <Button type="submit" variant="outline" size="sm" className="w-full h-8 text-xs">
            {t('filters.applyPrice')}
          </Button>
        </form>
      </div>

      {/* In-Stock Filter */}
      <div className="pt-4 border-t border-border">
        <label className="flex items-center justify-between text-xs cursor-pointer select-none py-1">
          <span className="font-medium text-foreground">{t('filters.inStockOnly')}</span>
          <input
            type="checkbox"
            checked={Boolean(inStockOnly)}
            onChange={handleStockToggle}
            className="size-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
          />
        </label>
      </div>
    </aside>
  );
}
