import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Monitor, ArrowRight } from 'lucide-react';

export function PromoBanner() {
  const t = useTranslations('home');

  return (
    <section className="container mx-auto px-4 py-8">
      <div className="relative overflow-hidden rounded-2xl bg-linear-to-r from-blue-900 via-indigo-900 to-slate-900 border border-border/40 p-8 sm:p-12 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl text-center md:text-left">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-300">
            {t('promoBannerKicker')}
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            {t('promoBannerTitle')}
          </h2>
          <p className="text-sm text-slate-300">{t('promoBannerSubtitle')}</p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden lg:flex size-14 rounded-2xl bg-white/10 items-center justify-center text-blue-300">
            <Monitor className="size-8" />
          </div>
          <Button
            size="lg"
            className="bg-white text-slate-900 hover:bg-slate-100 font-semibold shadow-md"
          >
            <span>{t('promoBannerCta')}</span>
            <ArrowRight className="size-4 ml-1.5" />
          </Button>
        </div>
      </div>
    </section>
  );
}
