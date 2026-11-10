'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { type BrandItem } from '@/lib/catalogue-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Building2, ExternalLink, Pencil, Trash2, Search, X } from 'lucide-react';

interface BrandListProps {
  brands: BrandItem[];
  onEdit: (brand: BrandItem) => void;
  onDelete: (brand: BrandItem) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: 'ALL' | 'ACTIVE' | 'INACTIVE';
  onStatusFilterChange: (status: 'ALL' | 'ACTIVE' | 'INACTIVE') => void;
}

export function BrandList({
  brands,
  onEdit,
  onDelete,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
}: BrandListProps) {
  const t = useTranslations('admin.catalogue.brands');

  const filteredBrands = React.useMemo(() => {
    return brands.filter((brand) => {
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = brand.name.toLowerCase().includes(query);
        const matchesSlug = brand.slug.toLowerCase().includes(query);
        if (!matchesName && !matchesSlug) return false;
      }

      // Status filter
      if (statusFilter === 'ACTIVE' && !brand.isActive) return false;
      if (statusFilter === 'INACTIVE' && brand.isActive) return false;

      return true;
    });
  }, [brands, searchQuery, statusFilter]);

  return (
    <div className="space-y-4">
      {/* Controls: Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="pl-9 pr-8 h-9"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-muted/40 p-1 rounded-lg border border-border/40 text-xs">
          <button
            type="button"
            onClick={() => onStatusFilterChange('ALL')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              statusFilter === 'ALL'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('filterAll')}
          </button>
          <button
            type="button"
            onClick={() => onStatusFilterChange('ACTIVE')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              statusFilter === 'ACTIVE'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('filterActive')}
          </button>
          <button
            type="button"
            onClick={() => onStatusFilterChange('INACTIVE')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              statusFilter === 'INACTIVE'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('filterInactive')}
          </button>
        </div>
      </div>

      {/* Table */}
      {filteredBrands.length === 0 ? (
        <div className="text-center py-12 px-4 rounded-xl border border-dashed border-border bg-muted/10">
          <Building2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/40 text-muted-foreground text-xs uppercase border-b border-border">
                <tr>
                  <th className="py-3 px-4 font-medium">{t('colLogo')}</th>
                  <th className="py-3 px-4 font-medium">{t('colSlug')}</th>
                  <th className="py-3 px-4 font-medium">{t('colWebsite')}</th>
                  <th className="py-3 px-4 font-medium">{t('colStatus')}</th>
                  <th className="py-3 px-4 font-medium text-right">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredBrands.map((brand) => (
                  <tr key={brand.id} className="hover:bg-muted/20 transition-colors">
                    {/* Brand Logo & Name */}
                    <td className="py-3 px-4 font-medium text-foreground">
                      <div className="flex items-center gap-3">
                        {brand.logoUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={brand.logoUrl}
                            alt={brand.name}
                            className="h-8 w-8 rounded-md object-contain border border-border p-0.5 bg-background shrink-0"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-md bg-muted/40 border border-border/50 flex items-center justify-center text-muted-foreground/60 shrink-0">
                            <Building2 className="h-4 w-4" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-foreground leading-snug">{brand.name}</p>
                          {brand.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-xs">
                              {brand.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Slug */}
                    <td className="py-3 px-4 text-xs font-mono text-muted-foreground">
                      /{brand.slug}
                    </td>

                    {/* Website */}
                    <td className="py-3 px-4">
                      {brand.websiteUrl ? (
                        <a
                          href={brand.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          {brand.websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <Badge
                        variant={brand.isActive ? 'outline' : 'secondary'}
                        className="text-xs font-normal"
                      >
                        {brand.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => onEdit(brand)}
                          title={t('edit')}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                          onClick={() => onDelete(brand)}
                          title={t('delete')}
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
      )}
    </div>
  );
}
