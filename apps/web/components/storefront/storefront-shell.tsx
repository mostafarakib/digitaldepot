'use client';

import React, { useState } from 'react';
import { TopBar } from '@/components/storefront/header/top-bar';
import { MainHeader } from '@/components/storefront/header/main-header';
import { CategoryNav } from '@/components/storefront/header/category-nav';
import { StorefrontFooter } from '@/components/storefront/footer/storefront-footer';
import { MobileNav } from '@/components/storefront/mobile-nav';
import { StorefrontVerificationBanner } from '@/components/auth/storefront-verification-banner';
import { CartProvider } from '@/components/storefront/cart/cart-provider';
import { CartDrawer } from '@/components/storefront/cart/cart-drawer';
import { WishlistProvider } from '@/components/storefront/wishlist/wishlist-provider';
import type { CategoryTreeNode } from '@/lib/catalogue-types';
import type { PublicStoreSettings } from '@/lib/settings-types';

interface StorefrontShellProps {
  children: React.ReactNode;
  categories?: CategoryTreeNode[];
  settings?: PublicStoreSettings | null;
}

export function StorefrontShell({
  children,
  categories = [],
  settings = null,
}: StorefrontShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <CartProvider>
      <WishlistProvider>
        <div className="min-h-screen flex flex-col bg-background text-foreground antialiased">
          <TopBar settings={settings} />
          <MainHeader onOpenMobileMenu={() => setMobileMenuOpen(true)} />
          <CategoryNav categories={categories} />
          <StorefrontVerificationBanner />
          <main className="flex-1">{children}</main>
          <StorefrontFooter categories={categories} settings={settings} />
          <MobileNav
            categories={categories}
            isOpen={mobileMenuOpen}
            onClose={() => setMobileMenuOpen(false)}
            onOpen={() => setMobileMenuOpen(true)}
          />
          <CartDrawer />
        </div>
      </WishlistProvider>
    </CartProvider>
  );
}
