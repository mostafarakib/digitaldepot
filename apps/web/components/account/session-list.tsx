'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/components/auth/auth-provider';
import { useRouter } from '@/i18n/routing';
import type { SessionItem } from '@/lib/auth-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Laptop, Smartphone, Globe, Shield, Trash2, Loader2, AlertCircle } from 'lucide-react';

export function SessionList({ refreshKey }: { refreshKey?: number }) {
  const t = useTranslations('auth.security.sessions');
  const router = useRouter();
  const { logout } = useAuth();

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isRevokingOthers, setIsRevokingOthers] = useState(false);

  const refetchSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient<{ sessions: SessionItem[] }>('/api/auth/sessions');
      setSessions(data.sessions);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t('fetchError'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let isMounted = true;
    apiClient<{ sessions: SessionItem[] }>('/api/auth/sessions')
      .then((data) => {
        if (isMounted) {
          setSessions(data.sessions);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError(t('fetchError'));
          }
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [t, refreshKey]);

  const handleRevokeSingle = async (session: SessionItem) => {
    if (!confirm(t('confirmRevokeSingle'))) return;

    setRevokingId(session.id);
    try {
      await apiClient(`/api/auth/sessions/${session.id}`, {
        method: 'DELETE',
      });

      if (session.isCurrent) {
        // If current session was revoked, log out locally and redirect
        await logout();
        router.push('/login');
      } else {
        await refetchSessions();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : t('revokeError'));
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeOthers = async () => {
    if (!confirm(t('confirmRevokeOthers'))) return;

    setIsRevokingOthers(true);
    try {
      await apiClient('/api/auth/sessions/revoke-others', {
        method: 'POST',
      });
      await refetchSessions();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('revokeError'));
    } finally {
      setIsRevokingOthers(false);
    }
  };

  const hasOtherSessions = sessions.some((s) => !s.isCurrent);

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-semibold">{t('title')}</CardTitle>
          </div>
          <CardDescription>{t('description')}</CardDescription>
        </div>

        {hasOtherSessions && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRevokeOthers}
            disabled={isRevokingOthers || isLoading}
            className="text-xs shrink-0"
          >
            {isRevokingOthers ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                {t('revokingOthers')}
              </>
            ) : (
              t('revokeOthersButton')
            )}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t('noSessions')}</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => {
              const isMobile =
                session.userAgent?.toLowerCase().includes('mobile') ||
                session.userAgent?.toLowerCase().includes('android') ||
                session.userAgent?.toLowerCase().includes('iphone');

              return (
                <div
                  key={session.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg border transition-all ${
                    session.isCurrent
                      ? 'border-primary/40 bg-primary/5 dark:bg-primary/10'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-2 rounded-md bg-muted text-muted-foreground shrink-0">
                      {isMobile ? (
                        <Smartphone className="h-4 w-4" />
                      ) : session.userAgent ? (
                        <Laptop className="h-4 w-4" />
                      ) : (
                        <Globe className="h-4 w-4" />
                      )}
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {session.userAgent || t('unknownDevice')}
                        </span>
                        {session.isCurrent && (
                          <Badge variant="default" className="text-[10px] h-4.5 px-1.5">
                            {t('currentSession')}
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {session.ipAddress && (
                          <span>
                            {t('ipLabel')}: {session.ipAddress}
                          </span>
                        )}
                        <span>
                          {t('lastActiveLabel')}: {new Date(session.lastActiveAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant={session.isCurrent ? 'destructive' : 'ghost'}
                    size="sm"
                    onClick={() => handleRevokeSingle(session)}
                    disabled={revokingId === session.id}
                    className="self-end sm:self-center h-8 text-xs shrink-0"
                  >
                    {revokingId === session.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        {session.isCurrent ? t('signOutThisDevice') : t('revokeButton')}
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
