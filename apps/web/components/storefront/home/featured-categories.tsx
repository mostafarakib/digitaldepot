import React from 'react';
import { useTranslations } from 'next-intl';
import { Smartphone, Laptop, Cpu, Monitor, Headphones, Watch, Keyboard, Wifi } from 'lucide-react';

export function FeaturedCategories() {
  const t = useTranslations('home');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');

  const categories = [
    {
      id: 'smartphones',
      name: tNav('smartphones'),
      icon: Smartphone,
      count: tCommon('viewModels'),
    },
    { id: 'laptops', name: tNav('laptops'), icon: Laptop, count: tCommon('viewModels') },
    { id: 'components', name: tNav('components'), icon: Cpu, count: tCommon('browseHardware') },
    { id: 'monitors', name: tNav('monitors'), icon: Monitor, count: tCommon('browseDisplays') },
    { id: 'audio', name: tNav('audio'), icon: Headphones, count: tCommon('browseAudio') },
    { id: 'wearables', name: tNav('wearables'), icon: Watch, count: tCommon('browseWearables') },
    {
      id: 'accessories',
      name: tNav('accessories'),
      icon: Keyboard,
      count: tCommon('browseAccessories'),
    },
    { id: 'networking', name: tNav('networking'), icon: Wifi, count: tCommon('browseNetworking') },
  ];

  return (
    <section className="container mx-auto px-4 py-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {t('categoriesTitle')}
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('categoriesSubtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-4">
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <div
              key={cat.id}
              className="group flex flex-col items-center text-center p-4 rounded-xl border border-border bg-card hover:bg-accent/40 hover:border-primary/50 transition-all cursor-pointer shadow-2xs"
            >
              <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                <Icon className="size-6" />
              </div>
              <h3 className="text-xs font-semibold text-foreground leading-tight line-clamp-2">
                {cat.name}
              </h3>
              <span className="text-[10px] text-muted-foreground mt-1">{cat.count}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
