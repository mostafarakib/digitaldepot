'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldAlert, AlertCircle, Loader2 } from 'lucide-react';

interface ReauthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  hasPassword?: boolean;
  hasGoogle?: boolean;
}

export function ReauthDialog({
  isOpen,
  onClose,
  onSuccess,
  hasPassword = true,
  hasGoogle = false,
}: ReauthDialogProps) {
  const t = useTranslations('auth.security.reauth');
  const [activeTab, setActiveTab] = useState<'password' | 'google'>(
    hasPassword ? 'password' : 'google',
  );
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement | null;

      setTimeout(() => {
        if (hasPassword) {
          passwordInputRef.current?.focus();
        }
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isSubmitting && !isGoogleLoading) {
          e.preventDefault();
          onClose();
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        if (previousActiveElement.current) {
          previousActiveElement.current.focus();
        }
      };
    }
  }, [isOpen, hasPassword, isSubmitting, isGoogleLoading, onClose]);

  if (!isOpen) return null;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await apiClient('/api/auth/confirm-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'INVALID_CREDENTIALS') {
          setError(t('invalidPassword'));
        } else {
          setError(err.message);
        }
      } else {
        setError(t('invalidPassword'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleReauth = async () => {
    setIsGoogleLoading(true);
    setError(null);

    try {
      const res = await apiClient<{ authUrl: string }>(
        '/api/auth/oauth/google/reauth?format=json',
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
        setError(err.message);
      } else {
        setError('Failed to initiate Google re-authentication');
      }
      setIsGoogleLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reauth-dialog-title"
    >
      <div
        ref={modalRef}
        className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 id="reauth-dialog-title" className="text-lg font-semibold text-foreground">
                {t('title')}
              </h2>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-4">{t('description')}</p>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {hasPassword && hasGoogle && (
            <div className="flex border-b border-border mb-4">
              <button
                type="button"
                className={`flex-1 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === 'password'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  setActiveTab('password');
                  setError(null);
                }}
              >
                {t('passwordTab')}
              </button>
              <button
                type="button"
                className={`flex-1 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === 'google'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  setActiveTab('google');
                  setError(null);
                }}
              >
                {t('googleTab')}
              </button>
            </div>
          )}

          {activeTab === 'password' && hasPassword && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reauth-password">{t('passwordLabel')}</Label>
                <Input
                  ref={passwordInputRef}
                  id="reauth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="current-password"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  {t('cancel')}
                </Button>
                <Button type="submit" className="flex-1" disabled={isSubmitting || !password}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('confirming')}
                    </>
                  ) : (
                    t('confirmButton')
                  )}
                </Button>
              </div>
            </form>
          )}

          {(activeTab === 'google' || (!hasPassword && hasGoogle)) && (
            <div className="space-y-4 pt-2">
              <Button
                type="button"
                className="w-full"
                variant="outline"
                onClick={handleGoogleReauth}
                disabled={isGoogleLoading}
              >
                {isGoogleLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('confirming')}
                  </>
                ) : (
                  <>
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
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
                    {t('googleButton')}
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-sm"
                onClick={onClose}
                disabled={isGoogleLoading}
              >
                {t('cancel')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
