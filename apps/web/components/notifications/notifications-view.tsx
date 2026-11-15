'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Package,
  RotateCcw,
  AlertTriangle,
  Info,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import {
  getUserNotificationsApi,
  markNotificationReadApi,
  markAllNotificationsReadApi,
  deleteNotificationApi,
} from '@/lib/api-client';
import type { NotificationItem, NotificationType } from '@/lib/notification-types';

export function NotificationsView() {
  const t = useTranslations('notifications');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = React.useCallback(() => {
    setIsLoading(true);
    setError(null);

    getUserNotificationsApi({
      page,
      limit: 15,
      unreadOnly: activeTab === 'unread',
    })
      .then((res) => {
        setNotifications(res.notifications);
        setUnreadCount(res.unreadCount);
        setTotalPages(res.pagination.totalPages);
        setTotal(res.pagination.total);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : tCommon('errorTitle'));
        setIsLoading(false);
      });
  }, [page, activeTab, tCommon]);

  useEffect(() => {
    let ignore = false;

    getUserNotificationsApi({
      page,
      limit: 15,
      unreadOnly: activeTab === 'unread',
    })
      .then((res) => {
        if (!ignore) {
          setNotifications(res.notifications);
          setUnreadCount(res.unreadCount);
          setTotalPages(res.pagination.totalPages);
          setTotal(res.pagination.total);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : tCommon('errorTitle'));
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [page, activeTab, tCommon]);

  const handleTabChange = (tab: 'all' | 'unread') => {
    setIsLoading(true);
    setActiveTab(tab);
    setPage(1);
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await markNotificationReadApi(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      if (activeTab === 'unread') {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }
    } catch {
      // Ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsReadApi();
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
      setUnreadCount(0);
      if (activeTab === 'unread') {
        setNotifications([]);
      }
    } catch {
      // Ignore
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNotificationApi(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch {
      // Ignore
    }
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'ORDER_CONFIRMED':
      case 'ORDER_STATUS_UPDATED':
        return <Package className="size-5 text-blue-500" />;
      case 'RETURN_REQUEST_UPDATED':
      case 'REFUND_PROCESSED':
        return <RotateCcw className="size-5 text-emerald-500" />;
      case 'LOW_STOCK_ALERT':
        return <AlertTriangle className="size-5 text-amber-500" />;
      default:
        return <Info className="size-5 text-slate-500" />;
    }
  };

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Bell className="size-6 text-primary" />
            {t('pageTitle')}
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount} {t('unread')}
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('pageDescription')}</p>
        </div>

        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            className="flex items-center gap-1.5 self-start sm:self-auto"
          >
            <CheckCheck className="size-4" />
            {t('markAllAsRead')}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-3 mb-6">
        <button
          type="button"
          onClick={() => handleTabChange('all')}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
            activeTab === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          {t('all')}
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('unread')}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'unread'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          {t('unread')}
          {unreadCount > 0 && (
            <span
              className={`text-xs px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'unread'
                  ? 'bg-primary-foreground text-primary'
                  : 'bg-primary/10 text-primary'
              }`}
            >
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4 flex items-start gap-4">
                <Skeleton className="size-10 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3 rounded" />
                  <Skeleton className="h-3 w-3/4 rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchNotifications} retryLabel={tCommon('retry')} />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-8 opacity-60" />}
          title={activeTab === 'unread' ? t('allCaughtUp') : t('noNotifications')}
          description={activeTab === 'unread' ? t('allCaughtUpDesc') : t('noNotificationsDesc')}
        />
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={`transition-all border ${
                !n.readAt ? 'bg-primary/[0.03] border-primary/20 shadow-sm' : 'border-border'
              }`}
            >
              <CardContent className="p-4 sm:p-5 flex items-start gap-4">
                <div className="p-2.5 rounded-lg bg-muted shrink-0 mt-0.5">
                  {getNotificationIcon(n.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4
                        className={`text-sm ${
                          !n.readAt
                            ? 'font-bold text-foreground'
                            : 'font-semibold text-foreground/90'
                        }`}
                      >
                        {n.title}
                      </h4>
                      {!n.readAt && <span className="size-2 rounded-full bg-primary shrink-0" />}
                    </div>

                    <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                      <Clock className="size-3" />
                      {new Date(n.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{n.message}</p>

                  <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-border/50">
                    <div>
                      {n.link && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (!n.readAt) void handleMarkAsRead(n.id);
                            router.push(n.link!);
                          }}
                          className="h-8 px-2.5 text-xs text-primary font-medium hover:bg-primary/10 gap-1.5"
                        >
                          {t('viewDetails')}
                          <ExternalLink className="size-3" />
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {!n.readAt && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarkAsRead(n.id)}
                          title={t('markAsRead')}
                          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Check className="size-3.5 mr-1" />
                          {t('markAsRead')}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(n.id)}
                        title={t('delete')}
                        className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <span className="text-xs text-muted-foreground">
                {t('showing', {
                  start: (page - 1) * 15 + 1,
                  end: Math.min(page * 15, total),
                  total,
                })}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => {
                    setIsLoading(true);
                    setPage((p) => Math.max(1, p - 1));
                  }}
                  className="h-8 px-2.5 text-xs"
                >
                  <ChevronLeft className="size-3.5 mr-1" />
                  {t('previous')}
                </Button>
                <span className="text-xs font-medium px-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => {
                    setIsLoading(true);
                    setPage((p) => Math.min(totalPages, p + 1));
                  }}
                  className="h-8 px-2.5 text-xs"
                >
                  {t('next')}
                  <ChevronRight className="size-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
