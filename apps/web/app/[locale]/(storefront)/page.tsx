import React from 'react';
import { HeroSection } from '@/components/storefront/home/hero-section';
import { ValueProps } from '@/components/storefront/home/value-props';
import { FeaturedCategories } from '@/components/storefront/home/featured-categories';
import { FeaturedProducts } from '@/components/storefront/home/featured-products';
import { PromoBanner } from '@/components/storefront/home/promo-banner';
import { NewArrivals } from '@/components/storefront/home/new-arrivals';

export default function StorefrontHomePage() {
  return (
    <div className="space-y-4">
      <HeroSection />
      <ValueProps />
      <FeaturedCategories />
      <FeaturedProducts />
      <PromoBanner />
      <NewArrivals />
    </div>
  );
}
