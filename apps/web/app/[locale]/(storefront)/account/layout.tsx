import React from 'react';
import type { Metadata } from 'next';
import { buildNoIndexRobots } from '@/lib/seo';

export const metadata: Metadata = {
  robots: buildNoIndexRobots(),
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
