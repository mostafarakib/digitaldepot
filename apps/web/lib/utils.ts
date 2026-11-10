import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats integer poisha (minor units) into formatted BDT string (e.g. ৳1,08,000).
 */
export function formatPoishaToBDT(poisha: number, locale = 'en-US'): string {
  const bdt = Math.floor(poisha / 100);
  const formatted = bdt.toLocaleString(locale);
  return `৳${formatted}`;
}
