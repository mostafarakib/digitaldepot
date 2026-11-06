'use client';

import React, { useEffect, useState } from 'react';
import { coordinateRefresh } from '@/lib/api-client';
import { useRouter } from '@/i18n/routing';

interface AdminAuthGateProps {
  returnUrl?: string;
}

export function AdminAuthGate({ returnUrl = '/admin' }: AdminAuthGateProps) {
  const router = useRouter();
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function attemptSessionRestoration() {
      try {
        const refreshed = await coordinateRefresh();
        if (!isMounted) return;

        if (refreshed) {
          // Trigger server component re-rendering now that fresh cookies are set
          router.refresh();
        } else {
          setHasFailed(true);
          router.replace(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
        }
      } catch {
        if (!isMounted) return;
        setHasFailed(true);
        router.replace(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
      }
    }

    void attemptSessionRestoration();

    return () => {
      isMounted = false;
    };
  }, [router, returnUrl]);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center text-foreground"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="absolute h-16 w-16 animate-ping rounded-full bg-primary/20" />
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>

      <h2 className="mt-6 text-lg font-semibold tracking-tight">
        {hasFailed ? 'Session Expired' : 'Verifying Administrative Access'}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {hasFailed
          ? 'Redirecting to login...'
          : 'Validating session credentials with security services...'}
      </p>
    </div>
  );
}

