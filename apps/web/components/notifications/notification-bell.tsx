'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import {
  Bell,
  Check,
  CheckCheck,
  Package,
  RotateCcw,
  AlertTriangle,
  Info,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/auth/auth-provider';
import { toBengaliDigits } from '@/lib/utils';
import {
  getUserNotificationsApi,
  getUnreadNotificationCountApi,
  markNotificationReadApi,
  markAllNotificationsReadApi,
} from '@/lib/api-client';
import type { NotificationItem, NotificationType } from '@/lib/notification-types';

export function NotificationBell() {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [recentNotifications, setRecentNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // 1. Fetch unread count initially and every 30s
  useEffect(() => {
    if (!isAuthenticated) return;

    let isMounted = true;

    async function fetchCount() {
      try {
        const res = await getUnreadNotificationCountApi();
        if (isMounted) {
          setUnreadCount(res.unreadCount);
        }
      } catch {
        // Silently swallow background polling errors
      }
    }

    void fetchCount();
    const interval = setInterval(fetchCount, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  // 2. Fetch recent notifications when popover opens
  useEffect(() => {
    if (!isOpen || !isAuthenticated) return;

    let isMounted = true;

    getUserNotificationsApi({ page: 1, limit: 5 })
      .then((res) => {
        if (isMounted) {
          setRecentNotifications(res.notifications);
          setUnreadCount(res.unreadCount);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, isAuthenticated]);

  // 3. Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
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

  // 4. Close on Escape
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

  if (!isAuthenticated) {
    return null;
  }

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await markNotificationReadApi(id);
      setRecentNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Fail silently
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsReadApi();
      setRecentNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: new Date().toISOString() })),
      );
      setUnreadCount(0);
    } catch {
      // Fail silently
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.readAt) {
      try {
        await markNotificationReadApi(notif.id);
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // Ignore
      }
    }
    setIsOpen(false);
    if (notif.link) {
      router.push(notif.link);
    }
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'ORDER_CONFIRMED':
      case 'ORDER_STATUS_UPDATED':
        return <Package className="size-4 text-blue-500" />;
      case 'RETURN_REQUEST_UPDATED':
      case 'REFUND_PROCESSED':
        return <RotateCcw className="size-4 text-emerald-500" />;
      case 'LOW_STOCK_ALERT':
        return <AlertTriangle className="size-4 text-amber-500" />;
      default:
        return <Info className="size-4 text-slate-500" />;
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => {
            if (!prev) setIsLoading(true);
            return !prev;
          });
        }}
        className="relative size-9 rounded-lg hover:bg-muted/50 flex items-center justify-center cursor-pointer transition-colors"
        title={t('title')}
        aria-label={t('title')}
        aria-expanded={isOpen}
      >
        <Bell className="size-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} ${t('unread')}`}
            className="absolute top-1 right-1 size-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center animate-in zoom-in-50"
          >
            {unreadCount > 99
              ? locale === 'bn'
                ? '৯৯+'
                : '99+'
              : locale === 'bn'
                ? toBengaliDigits(unreadCount)
                : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden animate-in fade-in-50 zoom-in-95">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground">{t('title')}</span>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                  {unreadCount} {t('unread')}
                </Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <CheckCheck className="size-3.5" />
                {t('markAllAsRead')}
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {isLoading ? (
              <div className="divide-y divide-border">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-3.5 flex items-start gap-3 animate-pulse">
                    <Skeleton className="size-8 rounded-md shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-3/4 rounded" />
                      <Skeleton className="h-3 w-full rounded" />
                      <Skeleton className="h-2.5 w-1/4 rounded mt-1" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentNotifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                <Bell className="size-8 mx-auto mb-2 text-muted-foreground/40" />
                <p className="font-medium text-foreground">{t('noNotifications')}</p>
                <p className="text-muted-foreground text-[11px] mt-0.5">
                  {t('noNotificationsDesc')}
                </p>
              </div>
            ) : (
              recentNotifications.map((n) => (
                <div key={n.id} className="relative flex items-stretch group">
                  <button
                    type="button"
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full p-3.5 pr-10 hover:bg-muted/50 text-left transition-colors flex items-start gap-3 cursor-pointer ${
                      !n.readAt ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="mt-0.5 p-1.5 rounded-md bg-muted shrink-0">
                      {getNotificationIcon(n.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`text-xs truncate ${
                            !n.readAt
                              ? 'font-semibold text-foreground'
                              : 'font-medium text-foreground/80'
                          }`}
                        >
                          {n.title}
                        </p>
                        {!n.readAt && <span className="size-2 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                        {n.message}
                      </p>
                      <span className="text-[10px] text-muted-foreground/70 mt-1 block">
                        {new Date(n.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </button>

                  {!n.readAt && (
                    <button
                      type="button"
                      onClick={(e) => handleMarkAsRead(n.id, e)}
                      title={t('markAsRead')}
                      aria-label={t('markAsRead')}
                      className="absolute top-3 right-2.5 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                    >
                      <Check className="size-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-2 border-t border-border bg-muted/20 text-center">
            <Link
              href="/account/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1.5 py-1 px-3 rounded-md hover:bg-primary/5 transition-colors"
            >
              {t('viewAll')}
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
