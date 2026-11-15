import React from 'react';
import { safeJsonLdReplacer } from '@/lib/seo';

interface JsonLdProps {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdReplacer(data) }}
    />
  );
}
