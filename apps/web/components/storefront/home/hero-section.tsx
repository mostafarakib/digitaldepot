import React from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { StorefrontProductSummary } from '@/lib/catalogue-types';
import { ArrowRight, ShieldCheck, Laptop, Headphones } from 'lucide-react';

interface HeroSectionProps {
  laptopProduct?: StorefrontProductSummary | null;
  headphoneProduct?: StorefrontProductSummary | null;
}

export function HeroSection({
  laptopProduct = null,
  headphoneProduct = null,
}: HeroSectionProps) {
  const t = useTranslations('home');
  const tCommon = useTranslations('common');

  return (
    <section className="container mx-auto px-4 pt-6 pb-3">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Hero Banner */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-5 sm:p-10 lg:p-12 text-white flex flex-col justify-between min-h-[290px] sm:min-h-[380px] shadow-md">
          <div className="relative z-10 max-w-xl space-y-3 sm:space-y-4">
            <Badge className="bg-blue-500/15 text-blue-200 border-blue-400/30 px-3 py-1 text-xs font-medium">
              <ShieldCheck className="size-3.5 mr-1.5 text-blue-400" />
              {t('heroBadge')}
            </Badge>

            <h1 className="text-2xl sm:text-4xl lg:text-[2.65rem] font-extrabold tracking-tight leading-[1.14] text-white">
              {t('heroTitle')}
            </h1>

            <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-lg">
              {t('heroDescription')}
            </p>
          </div>

          <div className="relative z-10 flex flex-wrap items-center gap-2.5 sm:gap-3 pt-6 sm:pt-7">
            <Button
              size="lg"
              asChild
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-sm"
            >
              <Link href="/products">
                <span>{t('heroCta')}</span>
                <ArrowRight className="size-4 ml-1.5" />
              </Link>
            </Button>

            <Button
              variant="outline"
              size="lg"
              asChild
              className="border-slate-700 bg-slate-800/80 text-white hover:bg-slate-800 hover:text-white"
            >
              <Link href="/products?featured=true">{t('heroSecondaryCta')}</Link>
            </Button>
          </div>
        </div>

        {/* Category Spotlight Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
          {/* Laptops Spotlight */}
          <Link
            href="/products?category=laptops"
            className="group relative flex-1 overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-6 flex flex-col justify-between min-h-[168px] text-white hover:border-primary/60 hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {laptopProduct?.primaryImage ? (
              <Image
                src={laptopProduct.primaryImage.url}
                alt={laptopProduct.primaryImage.altText || laptopProduct.name}
                fill
                sizes="(max-width: 1024px) 50vw, 33vw"
                className="object-cover object-center group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="absolute top-4 right-4 p-3 rounded-xl bg-blue-500/15 text-blue-300 border border-blue-400/20">
                <Laptop className="size-6" />
              </div>
            )}

            {/* Contrast Scrim */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-slate-950/45 bg-linear-to-r from-slate-950/92 via-slate-950/75 to-slate-950/35"
            />

            <div className="relative z-10 space-y-1.5 max-w-[240px]">
              <span className="text-[11px] font-semibold tracking-wider text-blue-300 uppercase block drop-shadow-xs">
                {t('sidePromo1Subtitle')}
              </span>
              <h2 className="text-lg font-bold text-white leading-snug drop-shadow-xs group-hover:text-blue-200 transition-colors">
                {t('sidePromo1Title')}
              </h2>
            </div>

            <div className="relative z-10 pt-5">
              <span className="text-xs font-semibold text-white inline-flex items-center gap-1 drop-shadow-xs group-hover:text-blue-300 transition-colors">
                <span>{tCommon('viewModels')}</span>
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>

          {/* Headphones Spotlight */}
          <Link
            href="/products?category=headphones"
            className="group relative flex-1 overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-6 flex flex-col justify-between min-h-[168px] text-white hover:border-primary/60 hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {headphoneProduct?.primaryImage ? (
              <Image
                src={headphoneProduct.primaryImage.url}
                alt={headphoneProduct.primaryImage.altText || headphoneProduct.name}
                fill
                sizes="(max-width: 1024px) 50vw, 33vw"
                className="object-cover object-[60%_30%] group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="absolute top-4 right-4 p-3 rounded-xl bg-blue-500/15 text-blue-300 border border-blue-400/20">
                <Headphones className="size-6" />
              </div>
            )}

            {/* Contrast Scrim */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-slate-950/45 bg-linear-to-r from-slate-950/92 via-slate-950/75 to-slate-950/35"
            />

            <div className="relative z-10 space-y-1.5 max-w-[240px]">
              <span className="text-[11px] font-semibold tracking-wider text-blue-300 uppercase block drop-shadow-xs">
                {t('sidePromo2Subtitle')}
              </span>
              <h2 className="text-lg font-bold text-white leading-snug drop-shadow-xs group-hover:text-blue-200 transition-colors">
                {t('sidePromo2Title')}
              </h2>
            </div>

            <div className="relative z-10 pt-5">
              <span className="text-xs font-semibold text-white inline-flex items-center gap-1 drop-shadow-xs group-hover:text-blue-300 transition-colors">
                <span>{tCommon('exploreAudio')}</span>
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}
