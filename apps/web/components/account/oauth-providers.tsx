'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/components/auth/auth-provider';
import type { OAuthProviderItem, OAuthProvidersResponse } from '@/lib/auth-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Share2, CheckCircle2, AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { ReauthDialog } from './reauth-dialog';

interface OAuthProvidersProps {
  statusMessage?: { type: 'success' | 'error'; message: string } | null;
}

export function OAuthProviders({ statusMessage }: OAuthProvidersProps) {
  const t = useTranslations('auth.security.oauth');
  const { user } = useAuth();
  const [providers, setProviders] = useState<OAuthProviderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [isLinking, setIsLinking] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [isConfirmUnlinkOpen, setIsConfirmUnlinkOpen] = useState(false);
  const [isReauthOpen, setIsReauthOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'link' | 'unlink' | null>(null);

  const confirmModalRef = useRef<HTMLDivElement>(null);

  const fetchProviders = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiClient<OAuthProvidersResponse>('/api/account/oauth');
      setProviders(res.providers || []);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    apiClient<OAuthProvidersResponse>('/api/account/oauth')
      .then((res) => {
        if (isMounted) {
          setProviders(res.providers || []);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          if (err instanceof ApiError) {
            setError(err.message);
          }
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const isGoogleLinked = providers.some((p) => p.provider === 'GOOGLE');
  const googleAccount = providers.find((p) => p.provider === 'GOOGLE');

  const handleLinkGoogle = async () => {
    setIsLinking(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiClient<{ authUrl: string }>(
        '/api/account/oauth/google/link?format=json',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ returnUrl: window.location.pathname }),
        },
      );

      if (res.authUrl) {
        window.location.href = res.authUrl;
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'REAUTHENTICATION_REQUIRED') {
          setPendingAction('link');
          setIsReauthOpen(true);
          return;
        }
        setError(err.message);
      } else {
        setError('Failed to initiate Google account link');
      }
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    if (!user?.hasPassword) {
      setError(t('lastAuthMethodWarning'));
      setIsConfirmUnlinkOpen(false);
      return;
    }

    setIsUnlinking(true);
    setError(null);
    setSuccess(null);

    try {
      await apiClient('/api/account/oauth/google', {
        method: 'DELETE',
      });

      setSuccess(t('unlinkSuccess'));
      setIsConfirmUnlinkOpen(false);
      await fetchProviders();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'REAUTHENTICATION_REQUIRED') {
          setIsConfirmUnlinkOpen(false);
          setPendingAction('unlink');
          setIsReauthOpen(true);
          return;
        }
        setError(err.message);
      } else {
        setError('Failed to disconnect Google account');
      }
    } finally {
      setIsUnlinking(false);
    }
  };

  const handleReauthSuccess = () => {
    if (pendingAction === 'link') {
      setPendingAction(null);
      void handleLinkGoogle();
    } else if (pendingAction === 'unlink') {
      setPendingAction(null);
      void handleUnlinkGoogle();
    }
  };

  return (
    <>
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-semibold">{t('title')}</CardTitle>
          </div>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusMessage && (
            <div
              className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
                statusMessage.type === 'success'
                  ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
                  : 'bg-destructive/10 border border-destructive/20 text-destructive'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{statusMessage.message}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-sm text-green-800 dark:text-green-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
              <span>{success}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="rounded-lg border border-border divide-y divide-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg border border-border bg-muted/40">
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{t('googleProvider')}</span>
                    {isLoading ? (
                      <Badge variant="outline" className="text-xs">
                        ...
                      </Badge>
                    ) : isGoogleLinked ? (
                      <Badge
                        variant="success"
                        className="text-xs bg-green-500/10 text-green-600 border-green-500/20"
                      >
                        {t('statusLinked')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        {t('statusNotLinked')}
                      </Badge>
                    )}
                  </div>
                  {isGoogleLinked && googleAccount?.linkedAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('linkedAt', {
                        date: new Date(googleAccount.linkedAt).toLocaleDateString(),
                      })}
                    </p>
                  )}
                </div>
              </div>

              <div>
                {isGoogleLinked ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive w-full sm:w-auto"
                    onClick={() => setIsConfirmUnlinkOpen(true)}
                    disabled={isUnlinking || isLoading}
                  >
                    {isUnlinking ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        {t('unlinking')}
                      </>
                    ) : (
                      t('unlinkButton')
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={handleLinkGoogle}
                    disabled={isLinking || isLoading}
                  >
                    {isLinking ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        {t('linking')}
                      </>
                    ) : (
                      t('linkButton')
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Modal for Disconnecting Google */}
      {isConfirmUnlinkOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div
            ref={confirmModalRef}
            className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">{t('confirmUnlinkTitle')}</h2>
            </div>

            <p className="text-sm text-muted-foreground">{t('confirmUnlinkDescription')}</p>

            {!user?.hasPassword && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>{t('lastAuthMethodWarning')}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsConfirmUnlinkOpen(false)}
                disabled={isUnlinking}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleUnlinkGoogle}
                disabled={isUnlinking || !user?.hasPassword}
              >
                {isUnlinking ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('unlinking')}
                  </>
                ) : (
                  t('confirmUnlink')
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reauth Dialog */}
      <ReauthDialog
        isOpen={isReauthOpen}
        onClose={() => {
          setIsReauthOpen(false);
          setPendingAction(null);
        }}
        onSuccess={handleReauthSuccess}
        hasPassword={Boolean(user?.hasPassword)}
        hasGoogle={isGoogleLinked}
      />
    </>
  );
}
