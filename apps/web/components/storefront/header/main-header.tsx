'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { Logo } from '@/components/common/logo';
import { Search, Heart, ShoppingCart, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/auth/user-menu';

interface MainHeaderProps {
  onOpenMobileMenu?: () => void;
}

export function MainHeader({ onOpenMobileMenu }: MainHeaderProps) {
  const t = useTranslations('common');
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/products?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      router.push('/products');
    }
  };

  return (
    <div className="w-full bg-background border-b border-border sticky top-0 z-40 backdrop-blur-md bg-background/95">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenMobileMenu}
            className="md:hidden"
            aria-label="Open mobile menu"
          >
            <SlidersHorizontal className="size-5" />
          </Button>
          <Logo />
        </div>

        {/* Search Bar */}
        <div className="hidden md:flex flex-1 max-w-xl mx-4">
          <form onSubmit={handleSearchSubmit} className="relative w-full flex items-center">
            <div className="absolute left-3 text-muted-foreground pointer-events-none">
              <Search className="size-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search')}
              className="w-full h-10 pl-9 pr-24 rounded-lg border border-input bg-muted/40 hover:bg-muted/70 focus:bg-background text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-text"
            />
            <div className="absolute right-2 flex items-center gap-1.5">
              <Button type="submit" size="sm" className="h-7 px-3 text-xs">
                {t('search')}
              </Button>
            </div>
          </form>
        </div>

        {/* User Entry Points */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Account */}
          <UserMenu />

          {/* Wishlist */}
          <div
            className="relative size-9 rounded-lg hover:bg-muted/50 flex items-center justify-center cursor-pointer transition-colors"
            title={t('wishlist')}
            aria-label={t('wishlist')}
          >
            <Heart className="size-5 text-muted-foreground" />
            <span className="absolute top-1 right-1 size-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
              0
            </span>
          </div>

          {/* Cart */}
          <div
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
            title={t('cart')}
            aria-label={t('cart')}
          >
            <div className="relative size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <ShoppingCart className="size-5" />
              <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                0
              </span>
            </div>
            <div className="hidden sm:flex flex-col text-left leading-tight">
              <span className="text-[11px] text-muted-foreground font-normal">{t('cart')}</span>
              <span className="text-xs font-bold text-foreground">{t('bdt')} 0</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Search Input */}
      <div className="md:hidden px-4 pb-3">
        <div className="relative w-full flex items-center">
          <Search className="size-4 absolute left-3 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            readOnly
            placeholder={t('search')}
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-muted/40 text-xs"
          />
        </div>
      </div>
    </div>
  );
}
