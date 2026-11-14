'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  ShieldAlert,
  Search,
  RefreshCw,
  Loader2,
  AlertCircle,
  Eye,
  Calendar,
  User,
  Package,
  RotateCcw,
  CreditCard,
  Boxes,
  Tag,
  Users,
  Cpu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type {
  UnifiedAuditLogItem,
  AuditCategory,
  AdminAuditStats,
  AuditActorItem,
} from '@/lib/audit-types';
import { getAdminAuditLogsApi, getAdminAuditActorsApi } from '@/lib/api-client';
import { AuditLogDetailModal } from './audit-log-detail-modal';

export function AuditLogManager() {
  const t = useTranslations('admin.auditLogs');
  const tCommon = useTranslations('common');

  const [logs, setLogs] = useState<UnifiedAuditLogItem[]>([]);
  const [stats, setStats] = useState<AdminAuditStats>({
    totalEvents: 0,
    orderEvents: 0,
    returnEvents: 0,
    refundEvents: 0,
    inventoryEvents: 0,
    pricingEvents: 0,
    customerEvents: 0,
  });
  const [actors, setActors] = useState<AuditActorItem[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters & Pagination State
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [category, setCategory] = useState<AuditCategory>('ALL');
  const [actorId, setActorId] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Inspect Modal
  const [selectedLog, setSelectedLog] = useState<UnifiedAuditLogItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  // Search debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Load actors once
  useEffect(() => {
    let ignore = false;
    getAdminAuditActorsApi()
      .then((res) => {
        if (!ignore) {
          setActors(res.actors);
        }
      })
      .catch(() => {
        // Silent catch for actor dropdown
      });

    return () => {
      ignore = true;
    };
  }, []);

  const loadAuditLogs = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await getAdminAuditLogsApi({
        page,
        limit: 20,
        category,
        actorId: actorId === 'ALL' ? undefined : actorId,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: debouncedSearch || undefined,
      });

      setLogs(res.logs);
      setStats(res.stats);
      setTotalPages(res.pagination.totalPages);
      setTotalCount(res.pagination.total);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('errorLoading'));
    } finally {
      setIsLoading(false);
    }
  }, [page, category, actorId, dateFrom, dateTo, debouncedSearch, t]);

  useEffect(() => {
    let ignore = false;

    getAdminAuditLogsApi({
      page,
      limit: 20,
      category,
      actorId: actorId === 'ALL' ? undefined : actorId,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: debouncedSearch || undefined,
    })
      .then((res) => {
        if (!ignore) {
          setLogs(res.logs);
          setStats(res.stats);
          setTotalPages(res.pagination.totalPages);
          setTotalCount(res.pagination.total);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setErrorMessage(err instanceof Error ? err.message : t('errorLoading'));
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [page, category, actorId, dateFrom, dateTo, debouncedSearch, t]);

  const renderCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'ORDERS':
        return (
          <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 flex items-center gap-1 w-fit">
            <Package className="size-3" /> {t('categories.ORDERS')}
          </Badge>
        );
      case 'RETURNS':
        return (
          <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30 flex items-center gap-1 w-fit">
            <RotateCcw className="size-3" /> {t('categories.RETURNS')}
          </Badge>
        );
      case 'REFUNDS':
        return (
          <Badge className="bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30 flex items-center gap-1 w-fit">
            <CreditCard className="size-3" /> {t('categories.REFUNDS')}
          </Badge>
        );
      case 'INVENTORY':
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 flex items-center gap-1 w-fit">
            <Boxes className="size-3" /> {t('categories.INVENTORY')}
          </Badge>
        );
      case 'PRICING':
        return (
          <Badge className="bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30 flex items-center gap-1 w-fit">
            <Tag className="size-3" /> {t('categories.PRICING')}
          </Badge>
        );
      case 'CUSTOMERS':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1 w-fit">
            <Users className="size-3" /> {t('categories.CUSTOMERS')}
          </Badge>
        );
      default:
        return <Badge variant="outline">{cat}</Badge>;
    }
  };

  const categoryTabs: Array<{ id: AuditCategory; label: string; count: number }> = [
    { id: 'ALL', label: t('categories.ALL'), count: stats.totalEvents },
    { id: 'ORDERS', label: t('categories.ORDERS'), count: stats.orderEvents },
    { id: 'RETURNS', label: t('categories.RETURNS'), count: stats.returnEvents },
    { id: 'REFUNDS', label: t('categories.REFUNDS'), count: stats.refundEvents },
    { id: 'INVENTORY', label: t('categories.INVENTORY'), count: stats.inventoryEvents },
    { id: 'PRICING', label: t('categories.PRICING'), count: stats.pricingEvents },
    { id: 'CUSTOMERS', label: t('categories.CUSTOMERS'), count: stats.customerEvents },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="size-6 text-blue-600 dark:text-blue-400" />
            {t('title')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAuditLogs}
            disabled={isLoading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {tCommon('refresh')}
          </Button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {categoryTabs.map((tab) => {
          const isSelected = category === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setCategory(tab.id);
                setPage(1);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                  isSelected
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table Card */}
      <Card className="border-slate-200 dark:border-slate-800">
        {/* Filters */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>

            {/* Actor Select */}
            <select
              value={actorId}
              onChange={(e) => {
                setActorId(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 max-w-xs"
            >
              <option value="ALL">{t('filters.allActors')}</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name} ({actor.role})
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Sub-row */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1 font-medium">
              <Calendar className="size-3.5" />
              {t('filters.dateRange')}:
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span>{tCommon('to')}</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
            />
            {(dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setPage(1);
                }}
                className="h-6 px-2 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                {tCommon('clear')}
              </Button>
            )}
          </div>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border-b border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 text-sm flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Loading */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
            <Loader2 className="size-8 animate-spin mb-3 text-blue-600 dark:text-blue-400" />
            <p className="text-sm">{t('loadingLogs')}</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-slate-500 dark:text-slate-400">
            <ShieldAlert className="size-12 mx-auto mb-3 opacity-30" />
            <h3 className="font-semibold text-slate-900 dark:text-white text-base">
              {t('noLogsFound')}
            </h3>
            <p className="text-sm mt-1 max-w-md mx-auto">{t('adjustFilterTip')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 text-xs uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">{t('table.timestamp')}</th>
                  <th className="py-3 px-4">{t('table.category')}</th>
                  <th className="py-3 px-4">{t('table.action')}</th>
                  <th className="py-3 px-4">{t('table.entity')}</th>
                  <th className="py-3 px-4">{t('table.actor')}</th>
                  <th className="py-3 px-4">{t('table.reason')}</th>
                  <th className="py-3 px-4 text-center">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {logs.map((log) => {
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Timestamp */}
                      <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleDateString()}
                        <div className="text-[11px] text-slate-400">
                          {new Date(log.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4">{renderCategoryBadge(log.category)}</td>

                      {/* Action */}
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 dark:text-white">
                        {log.action}
                      </td>

                      {/* Entity */}
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-200">
                          {log.entityReference}
                        </span>
                        <div className="text-[11px] text-slate-400">{log.entityType}</div>
                      </td>

                      {/* Actor */}
                      <td className="py-3 px-4">
                        {log.actor ? (
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white text-xs flex items-center gap-1">
                              <User className="size-3 text-slate-400" />
                              {log.actor.name}
                            </p>
                            <p className="text-[11px] text-slate-400">{log.actor.email}</p>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-slate-500 text-xs">
                            <Cpu className="size-3 text-slate-400" />
                            {t('system')}
                          </div>
                        )}
                      </td>

                      {/* Reason */}
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 max-w-xs truncate">
                        {log.reason || '—'}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedLog(log);
                            setIsDetailModalOpen(true);
                          }}
                          className="h-8 px-2 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                        >
                          <Eye className="size-3.5 mr-1" />
                          {t('inspect')}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              {t('pagination.showing', {
                start: (page - 1) * 20 + 1,
                end: Math.min(page * 20, totalCount),
                total: totalCount,
              })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
              >
                {tCommon('previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
              >
                {tCommon('next')}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Inspect Detail Modal */}
      <AuditLogDetailModal
        item={selectedLog}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedLog(null);
        }}
      />
    </div>
  );
}
