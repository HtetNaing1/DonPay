import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Code2 } from 'lucide-react';
import { auth } from '@/auth';
import { SignOutButton } from '@/components/atoms/sign-out-button';
import { ThemeToggle } from '@/components/atoms/theme-toggle';
import { Wordmark } from '@/components/atoms/wordmark';
import { DashboardMobileMenu } from '@/components/molecules/dashboard-mobile-menu';
import { DashboardNav } from '@/components/molecules/dashboard-nav';

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
        <DashboardNav />
        <div className="border-t border-hairline pt-4">
          <p className="flex items-center gap-2 px-2 font-mono text-[11px] tracking-widest text-ink-soft uppercase">
            <Code2 className="size-3.5" aria-hidden="true" />
            Devnet
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-hairline bg-surface px-6 py-3.5">
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <DashboardMobileMenu />
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
