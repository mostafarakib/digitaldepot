import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { LanguageSwitcher } from '@/components/common/language-switcher';
import { getConfiguredStoreContact } from '@/lib/storefront-server';
import { formatPoishaToBDT } from '@/lib/utils';
import type { PublicStoreSettings } from '@/lib/settings-types';
import { Truck, MapPin, Package } from 'lucide-react';

interface TopBarProps {
  settings?: PublicStoreSettings | null;
}

export function TopBar({ settings }: TopBarProps) {
  const tCommon = useTranslations('common');
  const tFooter = useTranslations('footer');
  const locale = useLocale();
  const contact = getConfiguredStoreContact(settings);
  const freeThreshold = settings?.freeShippingThreshold ?? 0;

  return (
    <div className="w-full bg-muted/50 border-b border-border text-xs text-muted-foreground">
      <div className="container mx-auto px-3 sm:px-4 h-9 flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-1.5 truncate">
            <Truck className="size-3.5 text-primary shrink-0" />
            <span className="truncate font-medium text-foreground/90">
              {freeThreshold > 0
                ? tCommon('freeDeliveryOver', {
                    amount: formatPoishaToBDT(freeThreshold, locale),
                  })
                : tCommon('nationwideDelivery')}
            </span>
          </div>

          {contact.storeAddress && (
            <div className="hidden md:flex items-center gap-1.5 text-muted-foreground truncate">
              <span className="text-border">•</span>
              <MapPin className="size-3.5 text-primary/80 shrink-0" />
              <span className="truncate">{contact.storeAddress}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <Link
            href="/account/orders"
            className="hidden sm:inline-flex items-center gap-1 hover:text-foreground transition-colors px-1.5 py-1 rounded"
          >
            <Package className="size-3.5 text-primary/80" />
            <span>{tFooter('trackOrder')}</span>
          </Link>

          <span className="hidden sm:inline text-border">|</span>

          <LanguageSwitcher />

          <span className="text-border">|</span>

          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
