import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** Compact relative time, e.g. "3 minutes ago" (past) or "in 2 hours" (future). */
export function relativeTime(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diffMs) >= ms) {
      return rtf.format(Math.round(diffMs / ms), unit);
    }
  }
  return rtf.format(Math.round(diffMs / 1000), 'second');
}
