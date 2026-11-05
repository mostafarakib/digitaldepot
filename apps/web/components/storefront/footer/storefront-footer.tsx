import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Logo } from '@/components/common/logo';
import { MapPin, Mail, Clock, CreditCard, Banknote, ShieldAlert } from 'lucide-react';

export function StorefrontFooter() {
  const t = useTranslations('footer');
  const tCommon = useTranslations('common');
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full bg-slate-900 text-slate-300 border-t border-slate-800 pt-12 pb-24 md:pb-12 mt-16">
      <div className="container mx-auto px-4">
        {/* Main Footer Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pb-10 border-b border-slate-800">
          {/* Brand Info */}
          <div className="space-y-4">
            <Logo className="text-white" />
            <p className="text-xs text-slate-400 leading-relaxed">{t('about')}</p>
            <div className="space-y-2 text-xs text-slate-400 pt-2">
              <div className="flex items-start gap-2">
                <MapPin className="size-4 text-primary shrink-0 mt-0.5" />
                <span>{t('locationValue')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="size-4 text-primary shrink-0" />
                <span>{t('contactEmail')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-primary shrink-0" />
                <span>{t('contactHours')}</span>
              </div>
            </div>
          </div>

          {/* Customer Care */}
          <div>
            <h4 className="text-sm font-semibold text-white tracking-wider uppercase mb-4">
              {t('customerCare')}
            </h4>
            <ul className="space-y-2.5 text-xs text-slate-400">
              <li>
                <span className="hover:text-white transition-colors cursor-pointer">
                  {t('trackOrder')}
                </span>
              </li>
              <li>
                <span className="hover:text-white transition-colors cursor-pointer">
                  {t('warrantyTerms')}
                </span>
              </li>
              <li>
                <span className="hover:text-white transition-colors cursor-pointer">
                  {t('returnPolicy')}
                </span>
              </li>
              <li>
                <span className="hover:text-white transition-colors cursor-pointer">
                  {t('faq')}
                </span>
              </li>
            </ul>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-semibold text-white tracking-wider uppercase mb-4">
              {t('quickLinks')}
            </h4>
            <ul className="space-y-2.5 text-xs text-slate-400">
              <li>
                <span className="hover:text-white transition-colors cursor-pointer">
                  {t('aboutUs')}
                </span>
              </li>
              <li>
                <span className="hover:text-white transition-colors cursor-pointer">
                  {t('privacyPolicy')}
                </span>
              </li>
              <li>
                <span className="hover:text-white transition-colors cursor-pointer">
                  {t('terms')}
                </span>
              </li>
              <li>
                <Link
                  href="/status"
                  className="hover:text-white text-primary transition-colors flex items-center gap-1"
                >
                  <span>{t('statusPage')}</span>
                  <span className="text-[10px] bg-primary/20 text-primary-foreground px-1.5 py-0.5 rounded">
                    {t('phase1Badge')}
                  </span>
                </Link>
              </li>
              <li>
                <Link
                  href="/admin"
                  className="hover:text-white text-primary transition-colors flex items-center gap-1"
                >
                  <span>{tCommon('adminPortal')}</span>
                  <span className="text-[10px] bg-primary/20 text-primary-foreground px-1.5 py-0.5 rounded">
                    {t('phase2Badge')}
                  </span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Payment Methods (Clearly marked as placeholder) */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-white tracking-wider uppercase mb-4">
              {t('paymentPlaceholderTitle')}
            </h4>
            <p className="text-xs text-slate-400">{t('paymentDisclaimer')}</p>
            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/80 border border-slate-700/60">
                <CreditCard className="size-4 text-emerald-400" />
                <span className="font-medium text-slate-200">bKash (Demo)</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/80 border border-slate-700/60">
                <CreditCard className="size-4 text-amber-400" />
                <span className="font-medium text-slate-200">Nagad (Demo)</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/80 border border-slate-700/60">
                <CreditCard className="size-4 text-blue-400" />
                <span className="font-medium text-slate-200">Visa / Master</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/80 border border-slate-700/60">
                <Banknote className="size-4 text-purple-400" />
                <span className="font-medium text-slate-200">COD (Demo)</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-1">
              <ShieldAlert className="size-3.5 text-amber-500" />
              <span>{t('paymentPhaseNotice')}</span>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
          <p>{t('copyright', { year: currentYear })}</p>
          <div className="flex items-center gap-4">
            <span>{t('retailModelNotice')}</span>
            <span>•</span>
            <span>{t('singleStoreNotice')}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
