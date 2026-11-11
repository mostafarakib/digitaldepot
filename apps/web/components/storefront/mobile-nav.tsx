'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import {
  Home,
  Grid,
  Heart,
  ShoppingCart,
  User,
  X,
  Smartphone,
  Laptop,
  Cpu,
  Monitor,
  Headphones,
  Watch,
  Keyboard,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWishlist } from '@/components/storefront/wishlist/wishlist-provider';
import { useCart } from '@/components/storefront/cart/cart-provider';

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileNav({ isOpen, onClose }: MobileNavProps) {
  const tCommon = useTranslations('common');
  const tNav = useTranslations('nav');
  const { itemCount: wishlistCount } = useWishlist();
  const { cart, openDrawer } = useCart();
  const cartCount = cart?.totalQuantity ?? 0;

  const categories = [
    { id: 'smartphones', label: tNav('smartphones'), icon: Smartphone },
    { id: 'laptops', label: tNav('laptops'), icon: Laptop },
    { id: 'components', label: tNav('components'), icon: Cpu },
    { id: 'monitors', label: tNav('monitors'), icon: Monitor },
    { id: 'audio', label: tNav('audio'), icon: Headphones },
    { id: 'wearables', label: tNav('wearables'), icon: Watch },
    { id: 'accessories', label: tNav('accessories'), icon: Keyboard },
  ];

  return (
    <>
      {/* Mobile Bottom Bar (Thumb friendly) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border flex items-center justify-around h-16 px-2 shadow-lg">
        <Link
          href="/"
          className="flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors py-1 flex-1"
        >
          <Home className="size-5" />
          <span>{tNav('home')}</span>
        </Link>

        <button
          onClick={onClose}
          className="flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors py-1 flex-1 cursor-pointer"
        >
          <Grid className="size-5" />
          <span>{tNav('allCategories')}</span>
        </button>

        <Link
          href="/wishlist"
          className="flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors py-1 flex-1 relative cursor-pointer"
        >
          <Heart className="size-5" />
          {wishlistCount > 0 && (
            <span className="absolute top-1 right-5 size-3.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
              {wishlistCount > 99 ? '99+' : wishlistCount}
            </span>
          )}
          <span>{tCommon('wishlist')}</span>
        </Link>

        <button
          type="button"
          onClick={openDrawer}
          className="flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors py-1 flex-1 relative cursor-pointer"
        >
          <ShoppingCart className="size-5 text-primary" />
          {cartCount > 0 && (
            <span className="absolute top-1 right-5 size-3.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          )}
          <span className="text-primary font-medium">{tCommon('cart')}</span>
        </button>

        <Link
          href="/account"
          className="flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors py-1 flex-1 cursor-pointer"
        >
          <User className="size-5" />
          <span>{tCommon('account')}</span>
        </Link>
      </div>

      {/* Slide-over Mobile Drawer for Categories */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={onClose}
          />

          {/* Drawer content */}
          <div className="relative w-4/5 max-w-sm bg-background border-r border-border h-full flex flex-col p-5 shadow-2xl z-10 overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <span className="font-semibold text-sm flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                {tNav('allCategories')}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="size-8"
                aria-label="Close menu"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="py-4 space-y-1">
              {categories.map((cat) => {
                const Icon = cat.icon;
                return (
                  <div
                    key={cat.id}
                    onClick={onClose}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
                  >
                    <Icon className="size-4 text-primary" />
                    <span>{cat.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-auto pt-6 border-t border-border space-y-3">
              <Link
                href="/status"
                onClick={onClose}
                className="block text-xs text-muted-foreground hover:text-primary"
              >
                {tNav('systemStatusLink')}
              </Link>
              <Link
                href="/admin"
                onClick={onClose}
                className="block text-xs font-semibold text-primary hover:underline"
              >
                {tNav('adminDashboardLink')}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
