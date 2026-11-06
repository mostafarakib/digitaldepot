'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Menu, Search, UserCheck, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LanguageSwitcher } from '@/components/common/language-switcher';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { useAuth } from '@/components/auth/auth-provider';
import { useRouter } from '@/i18n/routing';

interface AdminHeaderProps {
  onOpenMobileSidebar: () => void;
}

export function AdminHeader({ onOpenMobileSidebar }: AdminHeaderProps) {
  const t = useTranslations('admin');
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const adminName = user?.profile?.firstName
    ? `${user.profile.firstName} ${user.profile.lastName || ''}`.trim()
    : user?.email || t('header.administrator');

  return (
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-20 px-4 sm:px-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenMobileSidebar}
          className="md:hidden"
          aria-label="Open sidebar navigation"
        >
          <Menu className="size-5" />
        </Button>

        <div className="hidden sm:flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1.5 py-0.5"
          >
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{t('header.storefrontOnline')}</span>
          </Badge>
          <span className="text-xs text-muted-foreground hidden lg:inline">
            {t('header.nodeTitle')}
          </span>
        </div>
      </div>

      {/* Admin Quick Search */}
      <div className="hidden md:flex items-center flex-1 max-w-xs mx-4">
        <div className="relative w-full flex items-center">
          <Search className="size-3.5 absolute left-3 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            readOnly
            placeholder={t('header.searchPlaceholder')}
            className="w-full h-8 pl-8 pr-12 rounded-md border border-input bg-muted/40 text-xs focus:outline-none cursor-default"
          />
          <kbd className="absolute right-2 text-[10px] font-mono text-muted-foreground bg-background px-1 rounded border border-border">
            Ctrl K
          </kbd>
        </div>
      </div>

      {/* Controls & Admin Profile */}
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />

        <div className="h-4 w-px bg-border mx-1" />

        <div className="flex items-center gap-2 pl-1">
          <div className="size-8 rounded-full bg-blue-600/15 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs border border-blue-500/30">
            <UserCheck className="size-4" />
          </div>
          <div className="hidden sm:flex flex-col text-left leading-none max-w-[140px]">
            <span className="text-xs font-semibold text-foreground truncate">{adminName}</span>
            <span className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {user?.email || t('header.superuser')}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="size-8 text-muted-foreground hover:text-destructive ml-1"
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
