import Link from 'next/link';
import { ThemeToggle } from '@/components/atoms/theme-toggle';
import { Wordmark } from '@/components/atoms/wordmark';
import { PaymentPathRail } from '@/components/organisms/payment-path-rail';

/**
 * Auth surface: the form works on paper; beside it, the pine panel shows the
 * one thing merchants are signing up for — a payment that reports its state.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-paper text-ink lg:grid-cols-[1fr_0.85fr]">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          >
            <Wordmark />
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-center font-mono text-[11px] tracking-widest text-ink-soft uppercase lg:text-left">
          Devnet demo — no real funds
        </p>
      </div>

      {/* Panel inverts with the theme: pine in light mode, porcelain in dark —
          so it always contrasts with the form column beside it. */}
      <aside className="hidden bg-pine text-porcelain transition-colors duration-200 lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-16 dark:bg-porcelain dark:text-pine">
        <p className="rise-in font-mono text-xs tracking-[0.2em] text-porcelain/60 uppercase dark:text-pine/60">
          Every payment, accounted for
        </p>

        <div>
          <PaymentPathRail />
          <p
            className="rise-in mt-10 max-w-xs text-[15px] leading-relaxed text-porcelain/70 dark:text-pine/75"
            style={{ '--rise-order': 6 } as React.CSSProperties}
          >
            A reference on every checkout, verification on-chain, and a webhook on every state —
            while the money moves straight to your wallet.
          </p>
        </div>

        <p
          className="rise-in font-mono text-xs text-porcelain/50 dark:text-pine/60"
          style={{ '--rise-order': 7 } as React.CSSProperties}
        >
          No pooled wallets. No withdrawals. No keys on our servers.
        </p>
      </aside>
    </div>
  );
}
