import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Sparkles, Laptop, Headphones, LayoutDashboard } from 'lucide-react';

export function HeroSection() {
  const t = useTranslations('home');
  const tCommon = useTranslations('common');

  return (
    <section className="container mx-auto px-4 pt-6 pb-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Hero Showcase */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-2xl bg-linear-to-br from-slate-900 via-blue-950 to-slate-900 border border-slate-800 p-8 sm:p-12 text-white flex flex-col justify-between min-h-[380px] sm:min-h-[420px] shadow-xl">
          {/* Subtle decorative background circles */}
          <div className="absolute top-0 right-0 -mt-10 -mr-10 size-80 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 -mb-12 size-60 rounded-full bg-indigo-600/15 blur-2xl pointer-events-none" />

          <div className="relative z-10 max-w-xl space-y-4">
            <Badge className="bg-primary/20 text-primary-foreground border-primary/40 px-3 py-1 text-xs">
              <Sparkles className="size-3.5 mr-1 text-blue-400" />
              {t('heroBadge')}
            </Badge>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight text-white">
              {t('heroTitle')}
            </h1>

            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              {t('heroDescription')}
            </p>
          </div>

          <div className="relative z-10 flex flex-wrap items-center gap-3 pt-6">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-lg shadow-primary/25"
            >
              <span>{t('heroCta')}</span>
              <ArrowRight className="size-4 ml-1" />
            </Button>

            <Button
              variant="outline"
              size="lg"
              asChild
              className="border-slate-700 bg-slate-800/60 text-white hover:bg-slate-700/80 hover:text-white"
            >
              <Link href="/admin">
                <LayoutDashboard className="size-4 mr-1.5" />
                <span>{t('heroSecondaryCta')}</span>
              </Link>
            </Button>
          </div>
        </div>

        {/* Side Promo Banner Tiles */}
        <div className="flex flex-col gap-4">
          {/* Side Promo 1 */}
          <div className="relative flex-1 overflow-hidden rounded-2xl bg-linear-to-br from-slate-900 to-slate-800 border border-slate-700/60 p-6 flex flex-col justify-between text-white shadow-md group">
            <div className="absolute top-3 right-3 p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 group-hover:scale-110 transition-transform">
              <Laptop className="size-6" />
            </div>
            <div className="space-y-1 max-w-[200px]">
              <span className="text-[11px] font-semibold tracking-wider text-blue-400 uppercase">
                {t('sidePromo1Subtitle')}
              </span>
              <h3 className="text-lg font-bold text-white leading-snug">{t('sidePromo1Title')}</h3>
            </div>
            <div className="pt-4">
              <span className="text-xs font-medium text-slate-300 inline-flex items-center gap-1 group-hover:text-primary transition-colors cursor-pointer">
                {tCommon('viewModels')} <ArrowRight className="size-3" />
              </span>
            </div>
          </div>

          {/* Side Promo 2 */}
          <div className="relative flex-1 overflow-hidden rounded-2xl bg-linear-to-br from-slate-900 to-slate-800 border border-slate-700/60 p-6 flex flex-col justify-between text-white shadow-md group">
            <div className="absolute top-3 right-3 p-3 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 group-hover:scale-110 transition-transform">
              <Headphones className="size-6" />
            </div>
            <div className="space-y-1 max-w-[200px]">
              <span className="text-[11px] font-semibold tracking-wider text-purple-400 uppercase">
                {t('sidePromo2Subtitle')}
              </span>
              <h3 className="text-lg font-bold text-white leading-snug">{t('sidePromo2Title')}</h3>
            </div>
            <div className="pt-4">
              <span className="text-xs font-medium text-slate-300 inline-flex items-center gap-1 group-hover:text-primary transition-colors cursor-pointer">
                {tCommon('exploreAudio')} <ArrowRight className="size-3" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
