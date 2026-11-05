'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = React.useTransition();

  const toggleLanguage = () => {
    const nextLocale = locale === 'en' ? 'bn' : 'en';
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      disabled={isPending}
      className={`h-8 px-2 text-xs font-medium gap-1.5 ${className}`}
      title={locale === 'en' ? 'বাংলায় পরিবর্তন করুন' : 'Switch to English'}
      aria-label={locale === 'en' ? 'Switch to Bangla' : 'Switch to English'}
    >
      <Globe className="size-3.5 text-muted-foreground" />
      <span>{locale === 'en' ? 'বাংলা' : 'English'}</span>
    </Button>
  );
}
