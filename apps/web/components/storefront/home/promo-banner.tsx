import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export function PromoBanner() {
  const t = useTranslations('home');
  const tCommon = useTranslations('common');

  return (
    <section className="container mx-auto px-4 py-6">
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 sm:p-10 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-5 sm:gap-6">
        <div className="space-y-2 max-w-xl">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
            {t('promoBannerKicker')}
          </span>
          <h2 className="text-xl sm:text-3xl font-bold tracking-tight text-white">
            {t('promoBannerTitle')}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{t('promoBannerSubtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full md:w-auto shrink-0">
          <Button
            size="lg"
            asChild
            className="bg-white text-slate-900 hover:bg-slate-100 font-semibold shadow-sm"
          >
            <Link href="/products?category=monitors">
              <span>{tCommon('browseDisplays')}</span>
              <ArrowRight className="size-4 ml-1.5" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            asChild
            className="border-slate-700 bg-slate-800/80 text-white hover:bg-slate-800 hover:text-white"
          >
            <Link href="/products?category=accessories">{t('promoBannerCta')}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
