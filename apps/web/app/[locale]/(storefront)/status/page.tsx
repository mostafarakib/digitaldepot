import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { env } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity,
  Database,
  Server,
  Clock,
  Link as LinkIcon,
  AlertTriangle,
  ArrowLeft,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'API Status',
};

type HealthData = {
  status: 'ok' | 'degraded';
  timestamp: string;
  database: 'connected' | 'disconnected';
  version: string;
};

type HealthResponse = {
  success: boolean;
  data: HealthData;
};

async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${env.serverApiUrl}/api/v1/health`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

export default async function StatusPage() {
  const t = await getTranslations('status');
  const tCommon = await getTranslations('common');
  const result = await fetchHealth();
  const isReachable = result !== null;
  const isHealthy = result?.success === true;

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/">
            <ArrowLeft className="size-4 mr-1.5" />
            <span>{tCommon('backToHome')}</span>
          </Link>
        </Button>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Activity className="size-7 text-primary" />
          <span>{t('title')}</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      {!isReachable && (
        <Card className="border-destructive/40 bg-destructive/5 mb-6">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              <CardTitle className="text-base font-semibold">{t('errorTitle')}</CardTitle>
            </div>
            <CardDescription className="text-xs">
              {t('errorDesc', { url: env.serverApiUrl })}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {isReachable && result && (
        <Card className="border-border shadow-sm">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <span>{t('systemConnectivity')}</span>
                <Badge variant={isHealthy ? 'success' : 'warning'}>
                  {isHealthy ? t('ok') : t('degraded')}
                </Badge>
              </CardTitle>
              <span className="text-xs text-muted-foreground">{t('phase1Verified')}</span>
            </div>
          </CardHeader>

          <CardContent className="divide-y divide-border/60 p-0 text-sm">
            {/* Status */}
            <div className="flex items-center justify-between p-4">
              <span className="text-muted-foreground flex items-center gap-2 font-medium">
                <Server className="size-4 text-primary" />
                {t('colStatus')}
              </span>
              <Badge variant={result.data.status === 'ok' ? 'success' : 'warning'}>
                {result.data.status === 'ok' ? `✅ ${t('ok')}` : `⚠️ ${t('degraded')}`}
              </Badge>
            </div>

            {/* Database */}
            <div className="flex items-center justify-between p-4">
              <span className="text-muted-foreground flex items-center gap-2 font-medium">
                <Database className="size-4 text-primary" />
                {t('colDatabase')}
              </span>
              <Badge variant={result.data.database === 'connected' ? 'success' : 'destructive'}>
                {result.data.database === 'connected'
                  ? `✅ ${t('connected')}`
                  : `❌ ${t('disconnected')}`}
              </Badge>
            </div>

            {/* Version */}
            <div className="flex items-center justify-between p-4">
              <span className="text-muted-foreground flex items-center gap-2 font-medium">
                <Activity className="size-4 text-primary" />
                {t('colVersion')}
              </span>
              <span className="font-mono text-xs font-semibold text-foreground">
                v{result.data.version}
              </span>
            </div>

            {/* Timestamp */}
            <div className="flex items-center justify-between p-4">
              <span className="text-muted-foreground flex items-center gap-2 font-medium">
                <Clock className="size-4 text-primary" />
                {t('colTimestamp')}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {result.data.timestamp}
              </span>
            </div>

            {/* Target URL */}
            <div className="flex items-center justify-between p-4">
              <span className="text-muted-foreground flex items-center gap-2 font-medium">
                <LinkIcon className="size-4 text-primary" />
                {t('colUrl')}
              </span>
              <code className="text-xs bg-muted px-2 py-1 rounded font-mono text-foreground">
                {env.serverApiUrl}
              </code>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
