import React from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, ShoppingCart, Heart, Keyboard, Watch, HardDrive, Mouse } from 'lucide-react';

export function NewArrivals() {
  const t = useTranslations('home');
  const tCommon = useTranslations('common');

  const products = [
    {
      id: 'demo-na-1',
      title: 'MechStrike RGB Mechanical Keyboard',
      category: 'Peripherals',
      specs: 'Hot-swappable Red Switches • Gasket Mounted • PBT Keycaps',
      price: '7,200',
      rating: 4.8,
      reviews: 12,
      icon: Keyboard,
    },
    {
      id: 'demo-na-2',
      title: 'PulseFit AMOLED Smart Fitness Watch',
      category: 'Wearables',
      specs: '1.43" AMOLED • Built-in GPS • 14-Day Battery • SpO2',
      price: '12,800',
      rating: 4.7,
      reviews: 8,
      icon: Watch,
    },
    {
      id: 'demo-na-3',
      title: 'HyperSpeed 1TB PCIe 4.0 NVMe SSD',
      category: 'Components',
      specs: 'Up to 7,400 MB/s Read • DRAM Cache • Graphene Heatsink',
      price: '9,900',
      rating: 4.9,
      reviews: 27,
      icon: HardDrive,
    },
    {
      id: 'demo-na-4',
      title: 'PrecisionPro Wireless Ergonomic Mouse',
      category: 'Accessories',
      specs: 'Tri-mode 2.4G/BT • 26K Optical Sensor • 75g Ultra-light',
      price: '4,500',
      rating: 4.6,
      reviews: 15,
      icon: Mouse,
    },
  ];

  return (
    <section className="container mx-auto px-4 py-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {t('newArrivalsTitle')}
            </h2>
            <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
              {t('newIn')}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t('newArrivalsSubtitle')}
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
                  <span className="text-base font-bold text-foreground">
                    {tCommon('bdt')} {item.price}
                  </span>

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
