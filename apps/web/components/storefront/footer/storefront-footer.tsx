import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Logo } from '@/components/common/logo';
import { getConfiguredStoreContact } from '@/lib/storefront-server';
import { formatPoishaToBDT } from '@/lib/utils';
import type { CategoryTreeNode } from '@/lib/catalogue-types';
import type { PublicStoreSettings } from '@/lib/settings-types';
import { MapPin, Mail, Clock, Phone, CreditCard, Banknote, Truck, ShieldCheck } from 'lucide-react';

interface StorefrontFooterProps {
  categories?: CategoryTreeNode[];
  settings?: PublicStoreSettings | null;
}

export function StorefrontFooter({
  categories = [],
  settings = null,
}: StorefrontFooterProps = {}) {
  const t = useTranslations('footer');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const currentYear = new Date().getFullYear();
  const contact = getConfiguredStoreContact(settings);

  const fallbackCategories = [
    { slug: 'smartphones', name: tNav('smartphones') },
    { slug: 'laptops', name: tNav('laptops') },
    { slug: 'headphones', name: tNav('headphones') },
    { slug: 'earbuds-audio', name: tNav('earbudsAudio') },
    { slug: 'smartwatches', name: tNav('smartwatches') },
    { slug: 'monitors', name: tNav('monitors') },
  ];

  const shopCategories =
    categories.length > 0
      ? categories
          .filter((cat) => cat.isActive)
          .slice(0, 6)
          .map((cat) => ({ slug: cat.slug, name: cat.name }))
      : fallbackCategories;

  return (
    <footer className="w-full bg-slate-900 text-slate-300 border-t border-slate-800 pt-12 pb-24 md:pb-10 mt-12">
      <div className="container mx-auto px-4">
        {/* Main Footer Columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 pb-10 border-b border-slate-800">
          {/* Brand & Contact */}
          <div className="space-y-4">
            <Logo inverted />
            <p className="text-xs text-slate-400 leading-relaxed">{t('about')}</p>

            {(contact.storeAddress ||
              contact.supportEmail ||
              contact.supportPhone ||
              contact.supportHours) && (
              <div className="space-y-2 text-xs text-slate-400 pt-1">
                {contact.storeAddress && (
                  <div className="flex items-start gap-2">
                    <MapPin className="size-4 text-blue-400 shrink-0 mt-0.5" />
                    <span>{contact.storeAddress}</span>
                  </div>
                )}
                {contact.supportEmail && (
                  <div className="flex items-center gap-2">
                    <Mail className="size-4 text-blue-400 shrink-0" />
                    <a
                      href={`mailto:${contact.supportEmail}`}
                      className="hover:text-white transition-colors"
                    >
                      {contact.supportEmail}
                    </a>
                  </div>
                )}
                {contact.supportPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="size-4 text-blue-400 shrink-0" />
                    <span>{contact.supportPhone}</span>
                  </div>
                )}
                {contact.supportHours && (
                  <div className="flex items-center gap-2">
                    <Clock className="size-4 text-blue-400 shrink-0" />
                    <span>{contact.supportHours}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Shop Categories */}
          <div>
            <h3 className="text-xs font-semibold text-white tracking-wider uppercase mb-4">
              {t('shopCategories')}
            </h3>
            <ul className="space-y-2.5 text-xs text-slate-400">
              <li>
                <Link href="/products" className="hover:text-white transition-colors">
                  {t('allProducts')}
                </Link>
              </li>
              <li>
                <Link href="/products?featured=true" className="hover:text-white transition-colors">
                  {t('featuredProducts')}
                </Link>
              </li>
              {shopCategories.map((cat) => (
                <li key={cat.slug}>
                  <Link
                    href={`/products?category=${encodeURIComponent(cat.slug)}`}
                    className="hover:text-white transition-colors"
                  >
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Customer Account & Orders */}
          <div>
            <h3 className="text-xs font-semibold text-white tracking-wider uppercase mb-4">
              {t('accountAndOrders')}
            </h3>
            <ul className="space-y-2.5 text-xs text-slate-400">
              <li>
                <Link href="/account" className="hover:text-white transition-colors">
                  {t('myAccount')}
                </Link>
              </li>
              <li>
                <Link href="/account/orders" className="hover:text-white transition-colors">
                  {t('trackOrder')}
                </Link>
              </li>
              <li>
                <Link href="/account/returns" className="hover:text-white transition-colors">
                  {t('returnsAndRefunds')}
                </Link>
              </li>
              <li>
                <Link href="/account/addresses" className="hover:text-white transition-colors">
                  {t('savedAddresses')}
                </Link>
              </li>
              <li>
                <Link href="/wishlist" className="hover:text-white transition-colors">
                  {tCommon('wishlist')}
                </Link>
              </li>
              <li>
                <Link href="/cart" className="hover:text-white transition-colors">
                  {tCommon('cart')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Payment & Delivery */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-white tracking-wider uppercase mb-4">
              {t('paymentMethodsTitle')}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">{t('paymentMethodsSubtitle')}</p>
            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                <Banknote className="size-4 text-emerald-400 shrink-0" />
                <span className="font-medium text-slate-200 truncate">{t('codLabel')}</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                <CreditCard className="size-4 text-pink-400 shrink-0" />
                <span className="font-medium text-slate-200 truncate">bKash</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                <CreditCard className="size-4 text-amber-400 shrink-0" />
                <span className="font-medium text-slate-200 truncate">Nagad</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                <CreditCard className="size-4 text-blue-400 shrink-0" />
                <span className="font-medium text-slate-200 truncate">{t('cardsLabel')}</span>
              </div>
            </div>

            {settings && (
              <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
                <Truck className="size-3.5 text-blue-400 shrink-0" />
                <span>
                  {t('deliveryRates', {
                    dhaka: formatPoishaToBDT(settings.insideDhakaShippingFee, locale),
                    outside: formatPoishaToBDT(settings.outsideDhakaShippingFee, locale),
                  })}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <ShieldCheck className="size-3.5 text-emerald-400 shrink-0" />
              <span>{t('secureGatewayNote')}</span>
            </div>
          </div>
        </div>

        {/* Bottom Copyright Bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
          <p>{t('copyright', { year: currentYear })}</p>
          <span>{t('nationwideBadge')}</span>
        </div>
      </div>
    </footer>
  );
}
