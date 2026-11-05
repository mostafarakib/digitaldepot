import React from 'react';
import { useTranslations } from 'next-intl';
import { Truck, ShieldCheck, CreditCard, Headphones } from 'lucide-react';

export function ValueProps() {
  const t = useTranslations('home.features');

  const features = [
    {
      icon: Truck,
      title: t('coverage.title'),
      description: t('coverage.description'),
    },
    {
      icon: ShieldCheck,
      title: t('warranty.title'),
      description: t('warranty.description'),
    },
    {
      icon: CreditCard,
      title: t('payments.title'),
      description: t('payments.description'),
    },
    {
      icon: Headphones,
      title: t('support.title'),
      description: t('support.description'),
    },
  ];

  return (
    <section className="container mx-auto px-4 py-6" aria-label="Store Features">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {features.map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={index}
              className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card/60 shadow-xs hover:border-primary/40 transition-colors"
            >
              <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="size-5" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
                <p className="text-xs text-muted-foreground leading-snug">{item.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
