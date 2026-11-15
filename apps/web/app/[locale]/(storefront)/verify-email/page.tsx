import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { VerifyEmailContent } from '@/components/auth/verify-email-content';
import { Loader2 } from 'lucide-react';
import { buildNoIndexRobots } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.verifyEmail' });
  return {
    title: t('pageTitle'),
    description: t('pageDescription'),
    referrer: 'no-referrer',
    robots: buildNoIndexRobots(),
  };
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
