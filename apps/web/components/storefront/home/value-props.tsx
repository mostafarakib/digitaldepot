import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { formatPoishaToBDT, toBengaliDigits } from '@/lib/utils';
import type { PublicStoreSettings } from '@/lib/settings-types';
import { Truck, ShieldCheck, CreditCard, RotateCcw } from 'lucide-react';

interface ValuePropsProps {
  settings?: PublicStoreSettings | null;
}

export function ValueProps({ settings }: ValuePropsProps) {
  const t = useTranslations('home.features');
  const locale = useLocale();

  const dhakaMin = settings?.estimatedDaysInsideDhakaMin ?? 2;
  const dhakaMax = settings?.estimatedDaysInsideDhakaMax ?? 3;
  const formattedRange =
    locale === 'bn'
      ? `${toBengaliDigits(dhakaMin)}–${toBengaliDigits(dhakaMax)}`
      : `${dhakaMin}–${dhakaMax}`;

  const features = [
    {
      icon: Truck,
      title: t('coverage.title'),
      description: settings
        ? t('coverage.dynamicDescription', {
            days: formattedRange,
            fee: formatPoishaToBDT(settings.insideDhakaShippingFee, locale),
          })
        : t('coverage.description'),
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
      icon: RotateCcw,
      title: t('support.title'),
      description: t('support.description'),
    },
  ];

  return (
    <section className="container mx-auto px-4 py-4" aria-label="Store Highlights">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {features.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="flex items-center gap-3.5 p-4 rounded-xl border border-border bg-card shadow-2xs"
            >
              <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="size-5" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-snug">{item.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
