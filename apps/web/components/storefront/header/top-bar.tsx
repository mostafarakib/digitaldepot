import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { LanguageSwitcher } from '@/components/common/language-switcher';
import { ShieldCheck, LayoutDashboard, Activity } from 'lucide-react';

export function TopBar() {
  const tCommon = useTranslations('common');
  const tFooter = useTranslations('footer');

  return (
    <div className="w-full bg-slate-100 dark:bg-slate-900 border-b border-border text-xs text-muted-foreground">
      <div className="container mx-auto px-4 h-9 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium text-foreground">{tCommon('demoNotice')}:</span>
            <span className="hidden sm:inline">{tFooter('locationValue')}</span>
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-muted-foreground/80">
            <ShieldCheck className="size-3.5 text-primary" />
            <span>{tCommon('phase2ShellActive')}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/status"
            className="flex items-center gap-1 hover:text-foreground transition-colors px-1.5 py-1"
          >
            <Activity className="size-3.5 text-primary" />
            <span className="hidden sm:inline">{tCommon('systemStatus')}</span>
          </Link>

          <span className="text-border">|</span>

          <Link
            href="/admin"
            className="flex items-center gap-1 font-medium text-primary hover:underline px-1.5 py-1"
          >
            <LayoutDashboard className="size-3.5" />
            <span>{tCommon('adminPortal')}</span>
          </Link>

          <span className="text-border">|</span>

          <LanguageSwitcher />

          <span className="text-border">|</span>

          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
