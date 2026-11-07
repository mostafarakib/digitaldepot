'use client';

import React, { useEffect } from 'react';
import { useAuth } from './auth-provider';
import { useRouter, usePathname } from '@/i18n/routing';

interface AuthGuardProps {
  children: React.ReactNode;
  returnUrl?: string;
}

export function AuthGuard({ children, returnUrl }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const target = returnUrl || pathname;
      router.replace(`/login?returnUrl=${encodeURIComponent(target)}`);
    }
  }, [isLoading, isAuthenticated, router, returnUrl, pathname]);

  if (isLoading) {
    return (
      <div
        className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="mt-4 text-sm text-muted-foreground">Verifying authentication session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
