'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { DashboardNav } from '@/components/molecules/dashboard-nav';

/** Hamburger toggle + dropdown nav for viewports where the sidebar is hidden.
 *  Must sit inside a positioned header (relative/sticky) — the panel anchors to it. */
export function DashboardMobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="dashboard-mobile-nav"
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="relative z-20 inline-flex cursor-pointer items-center justify-center rounded-md p-2.5 text-ink-soft transition-colors duration-200 hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {open ? (
          <X className="size-4" aria-hidden="true" />
        ) : (
          <Menu className="size-4" aria-hidden="true" />
        )}
      </button>
      {open && (
        <>
          {/* Transparent hit area: closes the menu on outside tap without dimming the page */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            id="dashboard-mobile-nav"
            className="absolute inset-x-0 top-full z-20 border-b border-hairline bg-surface px-4 pb-4 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 ease-out motion-reduce:animate-none"
          >
            <DashboardNav className="mt-2" />
          </div>
        </>
      )}
    </div>
  );
}
