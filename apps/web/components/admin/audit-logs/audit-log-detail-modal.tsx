'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  X,
  ShieldAlert,
  User,
  Clock,
  ExternalLink,
  Package,
  RotateCcw,
  Boxes,
  Tag,
  CreditCard,
  Users,
  Cpu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { UnifiedAuditLogItem, AuditCategory } from '@/lib/audit-types';
import { Link } from '@/i18n/routing';

interface AuditLogDetailModalProps {
  item: UnifiedAuditLogItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AuditLogDetailModal({ item, isOpen, onClose }: AuditLogDetailModalProps) {
  const t = useTranslations('admin.auditLogs');

  if (!isOpen || !item) return null;

  const renderCategoryIcon = (category: AuditCategory) => {
    switch (category) {
      case 'ORDERS':
        return <Package className="size-4" />;
      case 'RETURNS':
        return <RotateCcw className="size-4" />;
      case 'REFUNDS':
        return <CreditCard className="size-4" />;
      case 'INVENTORY':
        return <Boxes className="size-4" />;
      case 'PRICING':
        return <Tag className="size-4" />;
      case 'CUSTOMERS':
        return <Users className="size-4" />;
      default:
        return <ShieldAlert className="size-4" />;
    }
  };

  const getEntityLink = (category: string, ref: string): string | null => {
    switch (category) {
      case 'ORDERS':
        return `/admin/orders?search=${encodeURIComponent(ref)}`;
      case 'RETURNS':
        return `/admin/returns?search=${encodeURIComponent(ref)}`;
      case 'REFUNDS':
        return `/admin/payments?search=${encodeURIComponent(ref)}`;
      case 'CUSTOMERS':
        return `/admin/customers?search=${encodeURIComponent(ref)}`;
      case 'INVENTORY':
        return `/admin/inventory`;
      case 'PRICING':
        return `/admin/products`;
      default:
        return null;
    }
  };

  const entityLink = getEntityLink(item.category, item.entityReference);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              {renderCategoryIcon(item.category as AuditCategory)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg text-slate-900 dark:text-white">
                  {item.action}
                </h3>
                <Badge variant="outline" className="text-xs">
                  {item.category}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {new Date(item.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="size-4" />
          </Button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Entity & Actor Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Entity Target */}
            <Card className="bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60">
              <CardContent className="p-4 space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t('modal.targetEntity')}
                </span>
                <p className="font-mono font-semibold text-slate-900 dark:text-white text-sm">
                  {item.entityReference}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('modal.type')}: {item.entityType} • ID: {item.entityId}
                </p>
                {entityLink && (
                  <div className="pt-1">
                    <Link
                      href={entityLink}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                    >
                      {t('modal.viewEntity')} <ExternalLink className="size-3" />
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actor */}
            <Card className="bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60">
              <CardContent className="p-4 space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t('modal.actedBy')}
                </span>
                {item.actor ? (
                  <>
                    <p className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                      <User className="size-3.5 text-blue-600 dark:text-blue-400" />
                      {item.actor.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {item.actor.email}
                      {item.actor.role && ` • ${item.actor.role}`}
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 text-sm font-medium">
                    <Cpu className="size-4 text-slate-400" />
                    {t('modal.systemActor')}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Reason / Note */}
          {item.reason && (
            <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 rounded-lg text-xs space-y-1">
              <span className="font-semibold text-blue-900 dark:text-blue-300">
                {t('modal.reasonNote')}:
              </span>
              <p className="text-slate-800 dark:text-slate-200">{item.reason}</p>
            </div>
          )}

          {/* Structured Details Viewer */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              {t('modal.eventDetails')}
            </h4>

            {Object.keys(item.details || {}).length === 0 ? (
              <p className="text-xs text-slate-400 italic">{t('modal.noAdditionalDetails')}</p>
            ) : (
              <div className="space-y-2">
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-md overflow-hidden">
                  {Object.entries(item.details).map(([key, val]) => (
                    <div
                      key={key}
                      className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1"
                    >
                      <span className="font-mono text-slate-500 dark:text-slate-400 font-medium">
                        {key}
                      </span>
                      <span className="font-mono font-medium text-slate-800 dark:text-slate-200 text-right break-all">
                        {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('modal.close')}
          </Button>
        </div>
      </div>
    </div>
  );
}
