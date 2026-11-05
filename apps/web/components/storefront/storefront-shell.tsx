'use client';

import React, { useState } from 'react';
import { TopBar } from '@/components/storefront/header/top-bar';
import { MainHeader } from '@/components/storefront/header/main-header';
import { CategoryNav } from '@/components/storefront/header/category-nav';
import { StorefrontFooter } from '@/components/storefront/footer/storefront-footer';
import { MobileNav } from '@/components/storefront/mobile-nav';

export function StorefrontShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground antialiased">
      <TopBar />
      <MainHeader onOpenMobileMenu={() => setMobileMenuOpen(true)} />
      <CategoryNav />
      <main className="flex-1">{children}</main>
      <StorefrontFooter />
      <MobileNav isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
    </div>
  );
}
