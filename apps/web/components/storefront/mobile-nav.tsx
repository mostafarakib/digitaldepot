'use client';

import React, { useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useModalA11y } from '@/hooks/use-modal-a11y';
import { getCategoryIcon } from '@/components/storefront/category-icons';
import { toBengaliDigits } from '@/lib/utils';
import type { CategoryTreeNode } from '@/lib/catalogue-types';
import {
  Home,
  LayoutGrid,
  Heart,
  ShoppingCart,
  User,
  X,
  Package,
  Sparkles,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWishlist } from '@/components/storefront/wishlist/wishlist-provider';
import { useCart } from '@/components/storefront/cart/cart-provider';

interface MobileNavProps {
  categories?: CategoryTreeNode[];
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
}

export function MobileNav({ categories = [], isOpen, onClose, onOpen }: MobileNavProps) {
  const tCommon = useTranslations('common');
  const tNav = useTranslations('nav');
  const locale = useLocale();
  const { itemCount: wishlistCount } = useWishlist();
  const { cart, openDrawer } = useCart();
  const cartCount = cart?.totalQuantity ?? 0;
  const drawerRef = useRef<HTMLDivElement>(null);

  useModalA11y({
    isOpen,
    onClose,
    containerRef: drawerRef,
  });

  const fallbackCategories = [
    { slug: 'smartphones', name: tNav('smartphones') },
    { slug: 'laptops', name: tNav('laptops') },
    { slug: 'headphones', name: tNav('headphones') },
    { slug: 'earbuds-audio', name: tNav('earbudsAudio') },
    { slug: 'smartwatches', name: tNav('smartwatches') },
    { slug: 'keyboards', name: tNav('keyboards') },
    { slug: 'mice', name: tNav('mice') },
    { slug: 'monitors', name: tNav('monitors') },
    { slug: 'accessories', name: tNav('accessories') },
  ];

  const activeCategories =
    categories.length > 0
      ? categories
          .filter((cat) => cat.isActive)
          .map((cat) => ({ slug: cat.slug, name: cat.name }))
      : fallbackCategories;

  const formatBadge = (count: number) => {
    if (count > 99) return locale === 'bn' ? '৯৯+' : '99+';
    return locale === 'bn' ? toBengaliDigits(count) : String(count);
  };

  return (
    <>
      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border flex items-center justify-around h-16 px-1 shadow-lg"
      >
        <Link
          href="/"
          className="flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors py-1 flex-1 min-w-0"
        >
          <Home className="size-5 shrink-0" />
          <span className="truncate max-w-full px-0.5 leading-tight">{tNav('home')}</span>
        </Link>

        <button
          type="button"
          onClick={onOpen || onClose}
          className="flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors py-1 flex-1 min-w-0 cursor-pointer"
          aria-label={tNav('allCategories')}
        >
          <LayoutGrid className="size-5 shrink-0" />
          <span className="truncate max-w-full px-0.5 leading-tight">{tNav('allCategories')}</span>
        </button>

        <Link
          href="/wishlist"
          className="flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors py-1 flex-1 min-w-0 cursor-pointer"
        >
          <div className="relative inline-flex">
            <Heart className="size-5 shrink-0" />
            {wishlistCount > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-4 h-3.5 px-1 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
                {formatBadge(wishlistCount)}
              </span>
            )}
          </div>
          <span className="truncate max-w-full px-0.5 leading-tight">{tCommon('wishlist')}</span>
        </Link>

        <button
          type="button"
          onClick={openDrawer}
          className="flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors py-1 flex-1 min-w-0 cursor-pointer"
        >
          <div className="relative inline-flex">
            <ShoppingCart className="size-5 text-primary shrink-0" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-4 h-3.5 px-1 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
                {formatBadge(cartCount)}
              </span>
            )}
          </div>
          <span className="text-primary font-medium truncate max-w-full px-0.5 leading-tight">
            {tCommon('cart')}
          </span>
        </button>

        <Link
          href="/account"
          className="flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors py-1 flex-1 min-w-0 cursor-pointer"
        >
          <User className="size-5 shrink-0" />
          <span className="truncate max-w-full px-0.5 leading-tight">{tCommon('account')}</span>
        </Link>
      </nav>

      {/* Slide-over Mobile Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={onClose}
          />

          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={tNav('allCategories')}
            className="relative w-4/5 max-w-sm bg-background border-r border-border h-full flex flex-col p-5 shadow-2xl z-10 overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <span className="font-semibold text-sm flex items-center gap-2 text-foreground">
                <LayoutGrid className="size-4 text-primary" />
                {tNav('allCategories')}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="size-8"
                aria-label={tCommon('close')}
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="py-4 space-y-1">
              <Link
                href="/products"
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-muted/70 transition-colors"
              >
                <Layers className="size-4 text-primary" />
                <span>{tNav('allProductsLink')}</span>
              </Link>
              <Link
                href="/products?featured=true"
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                <Sparkles className="size-4 text-primary" />
                <span>{tNav('deals')}</span>
              </Link>

              <div className="pt-2 pb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {tNav('departmentsLabel')}
              </div>

              {activeCategories.map((cat) => {
                const Icon = getCategoryIcon(cat.slug);
                return (
                  <Link
                    key={cat.slug}
                    href={`/products?category=${encodeURIComponent(cat.slug)}`}
                    onClick={onClose}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground hover:bg-muted/70 transition-colors"
                  >
                    <Icon className="size-4 text-primary" />
                    <span>{cat.name}</span>
                  </Link>
                );
              })}
            </div>

            <div className="mt-auto pt-4 border-t border-border space-y-2">
              <Link
                href="/account/orders"
                onClick={onClose}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50"
              >
                <Package className="size-4 text-primary" />
                <span>{tNav('myOrders')}</span>
              </Link>
              <Link
                href="/account"
                onClick={onClose}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50"
              >
                <User className="size-4 text-primary" />
                <span>{tCommon('account')}</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
