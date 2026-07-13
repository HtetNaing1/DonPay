import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeftRight, Code2, KeyRound, Link2, Settings, Wallet, Webhook } from 'lucide-react';
import { auth } from '@/auth';
import { SignOutButton } from '@/components/atoms/sign-out-button';
import { ThemeToggle } from '@/components/atoms/theme-toggle';
import { Wordmark } from '@/components/atoms/wordmark';

/** Sections beyond Payments activate as their features land. */
const NAV = [
  { label: 'Payments', icon: ArrowLeftRight, href: '/dashboard', active: true },
  { label: 'Payment links', icon: Link2 },
  { label: 'Webhooks', icon: Webhook },
  { label: 'API keys', icon: KeyRound },
  { label: 'Wallets', icon: Wallet },
  { label: 'Settings', icon: Settings },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login');

  return (
    <div className="flex min-h-dvh bg-paper text-ink">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-hairline bg-surface px-4 py-6 md:flex">
        <Link
          href="/"
          className="self-start rounded-sm px-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        >
          <Wordmark className="text-xl" />
        </Link>
        <nav className="mt-8 flex-1" aria-label="Dashboard">
          <ul className="space-y-1">
            {NAV.map(({ label, icon: Icon, href, active }) => (
              <li key={label}>
                {href ? (
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className="flex items-center gap-3 rounded-md bg-brand/10 px-3 py-2 text-sm font-medium text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
            ))}
          </ul>
        </nav>
        <div className="border-t border-hairline pt-4">
          <p className="flex items-center gap-2 px-2 font-mono text-[11px] tracking-widest text-ink-soft uppercase">
            <Code2 className="size-3.5" aria-hidden="true" />
            Devnet
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-hairline bg-surface px-6 py-3.5">
          <div className="min-w-0 md:hidden">
            <Wordmark className="text-lg" />
          </div>
          <p className="hidden min-w-0 truncate text-sm text-ink-soft md:block">
            {session.user?.name}
            <span className="mx-2 text-hairline" aria-hidden="true">
              /
            </span>
            <span className="font-mono text-[13px]">{session.user?.email}</span>
          </p>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
