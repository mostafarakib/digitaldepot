import React from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Banknote,
  ShoppingBag,
  AlertTriangle,
  Users,
  ArrowUpRight,
  Package,
  Clock,
  CheckCircle2,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');

  const stats = [
    {
      title: t('stats.sales'),
      value: `${tCommon('bdt')} 184,200`,
      subtitle: t('stats.salesSub'),
      icon: Banknote,
      trend: t('stats.salesTrend'),
      color: 'text-emerald-500',
    },
    {
      title: t('stats.activeOrders'),
      value: '14',
      subtitle: t('stats.activeOrdersSub'),
      icon: ShoppingBag,
      trend: t('stats.activeOrdersTrend'),
      color: 'text-blue-500',
    },
    {
      title: t('stats.lowStock'),
      value: '3',
      subtitle: t('stats.lowStockSub'),
      icon: AlertTriangle,
      trend: t('stats.lowStockTrend'),
      color: 'text-amber-500',
    },
    {
      title: t('stats.customers'),
      value: '1,280',
      subtitle: t('stats.customersSub'),
      icon: Users,
      trend: t('stats.customersTrend'),
      color: 'text-purple-500',
    },
  ];

  const recentOrders = [
    {
      id: '#DD-1049',
      customer: 'Tanvir Hossain (Dhanmondi, Dhaka)',
      items: 'Apex Pro 5G (256GB)',
      total: '108,000',
      status: t('statusLabels.processing'),
      payment: 'Paid (bKash)',
      isPaid: true,
    },
    {
      id: '#DD-1048',
      customer: 'Farhana Ahmed (Gulshan, Dhaka)',
      items: 'VisionView 27" 4K Monitor',
      total: '42,000',
      status: t('statusLabels.pending'),
      payment: 'COD Pending',
      isPaid: false,
    },
    {
      id: '#DD-1047',
      customer: 'Kamrul Islam (Agrabad, Chittagong)',
      items: 'SoundWave ANC Headphones + Mouse',
      total: '23,000',
      status: t('statusLabels.delivered'),
      payment: 'Paid (Visa)',
      isPaid: true,
    },
    {
      id: '#DD-1046',
      customer: 'Sabbir Rahman (Zindabazar, Sylhet)',
      items: 'HyperSpeed 1TB PCIe 4.0 SSD',
      total: '9,900',
      status: t('statusLabels.processing'),
      payment: 'Paid (Nagad)',
      isPaid: true,
    },
    {
      id: '#DD-1045',
      customer: 'Nasrin Sultana (Uttara, Dhaka)',
      items: 'MechStrike RGB Keyboard',
      total: '7,200',
      status: t('statusLabels.delivered'),
      payment: 'Paid (COD)',
      isPaid: true,
    },
  ];

  const lowStockItems = [
    {
      sku: 'DD-PHONE-APEX-256',
      product: 'Apex Pro 5G Flagship (Midnight Black, 256GB)',
      category: 'Smartphones',
      stock: 2,
      threshold: 10,
    },
    {
      sku: 'DD-MON-VV27-4K',
      product: 'VisionView 27" 4K Creator Monitor (144Hz)',
      category: 'Monitors',
      stock: 3,
      threshold: 8,
    },
    {
      sku: 'DD-SSD-HS-1TB',
      product: 'HyperSpeed 1TB PCIe 4.0 NVMe SSD (M.2)',
      category: 'Components',
      stock: 4,
      threshold: 15,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t('dashboardTitle')}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {t('dashboardSubtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-mono">
            {t('overview.nodeLabel')}
          </Badge>
          <Button size="sm" variant="outline" className="text-xs">
            {t('overview.exportReport')}
          </Button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i} className="border-border shadow-2xs">
              <CardHeader className="flex flex-row items-center justify-between p-4 pb-2 space-y-0">
                <span className="text-xs font-medium text-muted-foreground">{stat.title}</span>
                <div
                  className={`size-8 rounded-lg bg-muted flex items-center justify-center ${stat.color}`}
                >
                  <Icon className="size-4" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1 space-y-1">
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {stat.value}
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{stat.subtitle}</span>
                  <span className="font-medium text-foreground">{stat.trend}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Orders and Inventory Watchlist Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders Table */}
        <Card className="lg:col-span-2 border-border shadow-2xs">
          <CardHeader className="p-5 border-b border-border/60 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ShoppingBag className="size-4 text-primary" />
                <span>{t('recentOrdersTitle')}</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {t('recentOrdersSubtitle')}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              <span>{tCommon('viewAll')}</span>
              <ArrowUpRight className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 text-muted-foreground border-b border-border/60">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">{t('columns.orderId')}</th>
                  <th className="py-2.5 px-4 font-semibold">{t('columns.customer')}</th>
                  <th className="py-2.5 px-4 font-semibold">{t('columns.items')}</th>
                  <th className="py-2.5 px-4 font-semibold">{t('columns.total')}</th>
                  <th className="py-2.5 px-4 font-semibold">{t('columns.status')}</th>
                  <th className="py-2.5 px-4 font-semibold">{t('columns.payment')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-primary">{order.id}</td>
                    <td className="py-3 px-4 font-medium text-foreground">{order.customer}</td>
                    <td className="py-3 px-4 text-muted-foreground">{order.items}</td>
                    <td className="py-3 px-4 font-semibold text-foreground">
                      {tCommon('bdt')} {order.total}
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          order.status === t('statusLabels.delivered') ? 'success' : 'secondary'
                        }
                        className="text-[10px]"
                      >
                        {order.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1.5 font-medium text-[11px]">
                        {order.isPaid ? (
                          <CheckCircle2 className="size-3 text-emerald-500" />
                        ) : (
                          <Clock className="size-3 text-amber-500" />
                        )}
                        <span>{order.payment}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Low Stock Alerts */}
        <Card className="border-border shadow-2xs flex flex-col justify-between">
          <div>
            <CardHeader className="p-5 border-b border-border/60">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-500" />
                <span>{t('lowStockTitle')}</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">{t('lowStockSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border/50">
              {lowStockItems.map((item) => (
                <div key={item.sku} className="p-4 space-y-1.5 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-[10px] text-muted-foreground">{item.sku}</span>
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      {item.stock} {t('overview.itemsLeft')}
                    </Badge>
                  </div>
                  <h4 className="text-xs font-semibold text-foreground line-clamp-1">
                    {item.product}
                  </h4>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                    <span>
                      {t('overview.categoryLabel')}: {item.category}
                    </span>
                    <span>
                      {t('overview.minThresholdLabel')}: {item.threshold}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </div>
          <div className="p-4 border-t border-border/60 bg-muted/20">
            <Button variant="outline" size="sm" className="w-full text-xs gap-1.5">
              <Package className="size-3.5" />
              <span>{t('overview.manageInventory')}</span>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
