import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProductCard } from '../product-card';
import type { StorefrontProductSummary } from '@/lib/catalogue-types';
import {
  Star,
  ShoppingCart,
  Heart,
  Smartphone,
  Laptop,
  Monitor,
  Headphones,
  ArrowRight,
} from 'lucide-react';

interface FeaturedProductsProps {
  products?: StorefrontProductSummary[];
}

export function FeaturedProducts({ products: liveProducts }: FeaturedProductsProps) {
  const t = useTranslations('home');
  const tCommon = useTranslations('common');

  if (liveProducts && liveProducts.length > 0) {
    return (
      <section className="container mx-auto px-4 py-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {t('featuredDealsTitle')}
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {t('featuredDealsSubtitle')}
            </p>
          </div>
          <Link
            href="/products?featured=true"
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {liveProducts.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    );
  }

  const products = [
    {
      id: 'demo-1',
      title: 'Apex Pro 5G Flagship Smartphone',
      category: 'Smartphones',
      specs: '256GB Storage • 12GB RAM • 120Hz AMOLED',
      price: '108,000',
      originalPrice: '115,000',
      rating: 4.8,
      reviews: 24,
      stock: tCommon('inStock'),
      icon: Smartphone,
    },
    {
      id: 'demo-2',
      title: 'UltraBook Aero 14" Slim Laptop',
      category: 'Laptops',
      specs: 'Core i7 14th Gen • 16GB RAM • 512GB SSD',
      price: '94,500',
      originalPrice: '99,000',
      rating: 4.9,
      reviews: 19,
      stock: tCommon('inStock'),
      icon: Laptop,
    },
    {
      id: 'demo-3',
      title: 'VisionView 27" 4K Creator Monitor',
      category: 'Monitors',
      specs: '4K UHD • 144Hz • IPS • 99% DCI-P3 • HDR400',
      price: '42,000',
      originalPrice: '45,500',
      rating: 4.7,
      reviews: 31,
      stock: tCommon('limitedStock'),
      icon: Monitor,
    },
    {
      id: 'demo-4',
      title: 'SoundWave ANC Wireless Studio Headphones',
      category: 'Audio',
      specs: 'Active Noise Cancelling • 40hr Battery • LDAC',
      price: '18,500',
      originalPrice: '21,000',
      rating: 4.6,
      reviews: 42,
      stock: tCommon('inStock'),
      icon: Headphones,
    },
  ];

  return (
    <section className="container mx-auto px-4 py-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {t('featuredDealsTitle')}
            </h2>
            <Badge variant="secondary" className="text-[10px] font-normal">
              {t('demoShowcase')}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t('featuredDealsSubtitle')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {products.map((item) => {
          const Icon = item.icon;
          return (
            <Card
              key={item.id}
              className="group overflow-hidden rounded-xl border border-border bg-card hover:shadow-md hover:border-primary/40 transition-all flex flex-col justify-between"
            >
              {/* Product Visual Area */}
              <div className="relative aspect-4/3 bg-muted/30 flex items-center justify-center p-6 border-b border-border/50 group-hover:bg-muted/50 transition-colors">
                <div className="size-20 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                  <Icon className="size-10" />
                </div>

                {/* Stock badge */}
                <span className="absolute top-3 left-3 text-[10px] font-medium px-2 py-0.5 rounded-md bg-background/90 text-foreground border border-border">
                  {item.stock}
                </span>

                {/* Wishlist action button (UI only) */}
                <button
                  className="absolute top-3 right-3 size-8 rounded-full bg-background/80 hover:bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                  title={tCommon('wishlist')}
                  aria-label={tCommon('wishlist')}
                >
                  <Heart className="size-4" />
                </button>
              </div>

              {/* Product Info Area */}
              <CardContent className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                    {item.category}
                  </span>
                  <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">{item.specs}</p>
                </div>

                {/* Rating */}
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="flex items-center text-amber-500">
                    <Star className="size-3.5 fill-amber-500" />
                  </div>
                  <span className="font-semibold text-xs text-foreground">{item.rating}</span>
                  <span className="text-[11px] text-muted-foreground">({item.reviews})</span>
                </div>

                {/* Price and Cart button */}
                <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-base font-bold text-foreground">
                      {tCommon('bdt')} {item.price}
                    </span>
                    <span className="text-[11px] text-muted-foreground line-through">
                      {tCommon('bdt')} {item.originalPrice}
                    </span>
                  </div>

                  <Button
                    size="sm"
                    className="h-8 px-3 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                    title={tCommon('addToCart')}
                  >
                    <ShoppingCart className="size-3.5" />
                    <span className="hidden sm:inline">{tCommon('addToCart')}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
