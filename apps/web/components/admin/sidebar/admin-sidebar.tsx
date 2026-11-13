'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import {
  LayoutDashboard,
  Package,
  Tags,
  Boxes,
  ShoppingBag,
  Users,
  TicketPercent,
  MessageSquare,
  Settings,
  ShieldAlert,
  Store,
  ChevronLeft,
  ChevronRight,
  Cpu,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface AdminSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function AdminSidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: AdminSidebarProps) {
  const t = useTranslations('admin.sidebar');
  const pathname = usePathname();

  const navigation = [
    {
      group: t('groups.core'),
      items: [{ href: '/admin', label: t('overview'), icon: LayoutDashboard }],
    },
    {
      group: t('groups.catalogue'),
      items: [
        { href: '/admin/products', label: t('products'), icon: Package },
        { href: '/admin/categories', label: t('categories'), icon: Tags },
        { href: '/admin/inventory', label: t('inventory'), icon: Boxes },
      ],
    },
    {
      group: t('groups.operations'),
      items: [
        { href: '/admin/orders', label: t('orders'), icon: ShoppingBag, badge: '14' },
        { href: '/admin/returns', label: t('returns'), icon: RotateCcw },
        { href: '/admin/customers', label: t('customers'), icon: Users },
        { href: '/admin/promotions', label: t('promotions'), icon: TicketPercent },
        { href: '/admin/reviews', label: t('reviews'), icon: MessageSquare },
      ],
    },
    {
      group: t('groups.system'),
      items: [
        { href: '/admin/settings', label: t('settings'), icon: Settings },
        { href: '/admin/audit-logs', label: t('auditLogs'), icon: ShieldAlert },
      ],
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 border-r border-slate-800">
      {/* Admin Brand Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800">
        <Link href="/admin" className="flex items-center gap-2.5 overflow-hidden">
          <div className="size-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Cpu className="size-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-none">
              <span className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                Digital<span className="text-blue-400">Depot</span>
                <Badge
                  variant="outline"
                  className="text-[9px] px-1 py-0 border-blue-500/40 text-blue-300"
                >
                  Admin
                </Badge>
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5 tracking-wider uppercase font-medium">
                {t('operationsSuite')}
              </span>
            </div>
          )}
        </Link>

        {/* Desktop Collapse Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="hidden md:flex size-7 text-slate-400 hover:text-white hover:bg-slate-800"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </Button>
      </div>

      {/* Nav Items */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 scrollbar-none">
        {navigation.map((group, groupIdx) => (
          <div key={groupIdx} className="space-y-1">
            {!collapsed && (
              <h4 className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                {group.group}
              </h4>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onCloseMobile}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="size-4 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </div>
                  {!collapsed && item.badge && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/30 font-semibold">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer Return Link */}
      <div className="p-3 border-t border-slate-800">
        <Link
          href="/"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          title={collapsed ? 'Storefront' : undefined}
        >
          <Store className="size-4 text-emerald-400 shrink-0" />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-slate-200">{t('returnToStore')}</span>
              <span className="text-[10px] text-slate-400">{t('exitAdminMode')}</span>
            </div>
          )}
        </Link>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:block transition-all duration-300 shrink-0 ${
          collapsed ? 'w-18' : 'w-64'
        }`}
      >
        <div
          className={`fixed top-0 bottom-0 left-0 transition-all duration-300 z-30 ${
            collapsed ? 'w-18' : 'w-64'
          }`}
        >
          {sidebarContent}
        </div>
      </aside>

      {/* Mobile Slide-over Drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xs" onClick={onCloseMobile} />
          <div className="relative w-64 max-w-xs h-full z-10">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
