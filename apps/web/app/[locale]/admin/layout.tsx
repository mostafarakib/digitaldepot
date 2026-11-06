import React from 'react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/admin-shell';
import { AdminAuthGate } from '@/components/admin/admin-auth-gate';
import { env } from '@/lib/config';
import type { AuthenticatedUser } from '@/lib/auth-types';

export const metadata: Metadata = {
  title: 'Admin Dashboard',
  description: 'DigitalDepot Operations & Retail Management Suite',
};

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const cookieStore = await cookies();

  const accessToken = cookieStore.get('dd_access_token')?.value;
  const refreshToken = cookieStore.get('dd_refresh_token')?.value;

  // Immediate redirect if no auth cookies exist at all
  if (!accessToken && !refreshToken) {
    redirect(`/${locale}/login?returnUrl=/admin`);
  }

  let user: AuthenticatedUser | null = null;
  let isTokenExpired = false;

  try {
    const cookieHeader = cookieStore.toString();
    const res = await fetch(`${env.serverApiUrl}/api/v1/auth/me`, {
      method: 'GET',
      headers: {
        cookie: cookieHeader,
        accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      user = data.data?.user ?? null;
    } else if (res.status === 401) {
      isTokenExpired = true;
    }
  } catch {
    // If backend is temporarily unreachable during SSR verification,
    // allow the client auth gate to attempt refresh via BFF if refreshToken exists
    isTokenExpired = true;
  }

  // Authoritative role check: user is authenticated with active admin role
  if (user) {
    if (user.role === 'ADMIN') {
      return <AdminShell>{children}</AdminShell>;
    }
    // Authenticated user lacks ADMIN privileges (e.g. CUSTOMER role)
    redirect(`/${locale}`);
  }

  // Expired access token but valid refresh token: restore session client-side
  if ((isTokenExpired || !accessToken) && refreshToken) {
    return <AdminAuthGate returnUrl="/admin" />;
  }

  // Session cannot be verified or refreshed
  redirect(`/${locale}/login?returnUrl=/admin`);
}
