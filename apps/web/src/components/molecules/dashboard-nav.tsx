'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
  KeyRound,
  Link2,
  Settings,
  Wallet,
  Webhook,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** Sections beyond Payments and Wallets activate as their features land. */
const NAV = [
  { label: 'Payments', icon: ArrowLeftRight, href: '/dashboard' },
  { label: 'Payment links', icon: Link2, href: '/dashboard/links' },
  { label: 'Webhooks', icon: Webhook },
  { label: 'API keys', icon: KeyRound, href: '/dashboard/api-keys' },
  { label: 'Wallets', icon: Wallet, href: '/dashboard/wallets' },
  { label: 'Settings', icon: Settings },
] as const;

export function DashboardNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={cn('mt-8 flex-1', className)} aria-label="Dashboard">
      <ul className="space-y-1">
        {NAV.map(({ label, icon: Icon, ...item }) => {
          const href = 'href' in item ? item.href : undefined;
          const active = href === pathname;
          return (
            <li key={label}>
              {href ? (
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                    active
                      ? 'bg-brand/10 text-brand-deep'
                      : 'text-ink-soft hover:bg-brand/5 hover:text-ink',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  title="Available soon in this devnet build"
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-ink-soft/50"
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                  <span className="ml-auto font-mono text-[10px] tracking-wider text-ink-soft/40 uppercase">
                    Soon
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
