import React from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Clock, ShieldCheck } from 'lucide-react';

interface AdminPlaceholderPageProps {
  title: string;
  description: string;
  phase: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export function AdminPlaceholderPage({
  title,
  description,
  phase,
  icon: Icon,
}: AdminPlaceholderPageProps) {
  const t = useTranslations('admin.placeholder');

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin">
            <ArrowLeft className="size-4 mr-1.5" />
            <span>{t('backToOverview')}</span>
          </Link>
        </Button>
        <Badge variant="outline" className="text-xs">
          {phase}
        </Badge>
      </div>

      <Card className="border-border shadow-xs">
        <CardHeader className="border-b border-border/60">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="size-5" />
              </div>
            )}
            <div>
              <CardTitle className="text-xl font-bold">{title}</CardTitle>
              <CardDescription className="text-xs mt-1">{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8 text-center space-y-4">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
            <Clock className="size-6 text-primary" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-semibold text-foreground">
              {t('featureScheduled', { phase })}
            </h3>
            <p className="text-xs text-muted-foreground">{t('scheduledNotice')}</p>
          </div>
          <div className="pt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-emerald-500" />
            <span>{t('shellConnected')}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
