import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/**
 * Converts western arabic digits (0-9) to Bengali digits (০-৯).
 */
export function toBengaliDigits(input: number | string): string {
  return String(input).replace(/[0-9]/g, (digit) => BENGALI_DIGITS[parseInt(digit, 10)] ?? digit);
}

/**
 * Formats integer poisha (minor units) into formatted BDT string (e.g. ৳1,08,000 or ৳১,০৮,০০০).
 */
export function formatPoishaToBDT(poisha: number, locale = 'en-US'): string {
  const bdt = Math.floor(poisha / 100);
  const resolvedLocale = locale === 'bn' ? 'bn-BD' : locale;
  const formatted = bdt.toLocaleString(resolvedLocale);
  return `৳${formatted}`;
}
