'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from './auth-provider';
import { Link, useRouter } from '@/i18n/routing';
import {
  User,
  LogOut,
  LayoutDashboard,
  ShieldCheck,
  ChevronDown,
  Package,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function UserMenu() {
  const t = useTranslations('auth.menu');
  const tCommon = useTranslations('common');
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-1.5 rounded-lg opacity-70">
        <div className="size-9 rounded-full bg-muted flex items-center justify-center">
          <User className="size-4 text-muted-foreground animate-pulse" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
      >
        <div className="size-9 rounded-full bg-muted flex items-center justify-center text-foreground">
          <User className="size-4 text-muted-foreground" />
        </div>
        <div className="hidden lg:flex flex-col text-left leading-tight">
          <span className="text-[11px] text-muted-foreground font-normal">
            {tCommon('account')}
          </span>
          <span className="text-xs font-semibold text-foreground">{tCommon('signIn')}</span>
        </div>
      </Link>
    );
  }

  const displayName = user.profile?.firstName
    ? `${user.profile.firstName} ${user.profile.lastName || ''}`.trim()
    : user.email.split('@')[0];

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
    router.push('/');
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div className="size-9 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="hidden lg:flex flex-col text-left leading-tight">
          <span className="text-[11px] text-muted-foreground font-normal max-w-[120px] truncate">
            {displayName}
          </span>
          <span className="text-xs font-semibold text-foreground flex items-center gap-1">
            {user.role === 'ADMIN' ? (
              <span className="flex items-center gap-0.5 text-primary">
                <ShieldCheck className="size-3" />
                Admin
              </span>
            ) : (
              tCommon('account')
            )}
            <ChevronDown className="size-3 text-muted-foreground" />
          </span>
        </div>
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-100"
        >
          <div className="px-3 py-2 border-b border-border/60">
            <p className="text-xs font-medium text-foreground truncate">{displayName}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
            <div className="mt-1.5">
              <Badge
                variant={user.role === 'ADMIN' ? 'default' : 'secondary'}
                className="text-[10px] h-4 px-1.5"
              >
                {user.role}
              </Badge>
            </div>
          </div>

          <div className="py-1">
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md hover:bg-muted transition-colors"
            >
              <User className="size-4 text-muted-foreground" />
              <span>{t('account')}</span>
            </Link>

            {user.role === 'CUSTOMER' && (
              <>
                <Link
                  href="/account/orders"
                  role="menuitem"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md hover:bg-muted transition-colors"
                >
                  <Package className="size-4 text-muted-foreground" />
                  <span>{t('orders')}</span>
                </Link>
                <Link
                  href="/account/returns"
                  role="menuitem"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md hover:bg-muted transition-colors"
                >
                  <RotateCcw className="size-4 text-muted-foreground" />
                  <span>{t('returns')}</span>
                </Link>
              </>
            )}

            {user.role === 'ADMIN' && (
              <Link
                href="/admin"
                role="menuitem"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-primary rounded-md hover:bg-primary/10 transition-colors"
              >
                <LayoutDashboard className="size-4 text-primary" />
                <span>{t('adminPortal')}</span>
              </Link>
            )}
          </div>

          <div className="pt-1 border-t border-border/60">
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-destructive rounded-md hover:bg-destructive/10 transition-colors cursor-pointer"
            >
              <LogOut className="size-4" />
              <span>{t('signOut')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
