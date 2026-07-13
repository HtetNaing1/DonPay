import Link from 'next/link';
import { ThemeToggle } from '@/components/atoms/theme-toggle';
import { Wordmark } from '@/components/atoms/wordmark';

const HAPPY_PATH = ['CREATED', 'PENDING', 'DETECTED', 'CONFIRMED', 'FINALIZED'];

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

      <aside className="hidden bg-pine text-porcelain lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-16">
        <p className="font-mono text-xs tracking-[0.2em] text-porcelain/60 uppercase">
          Every payment, accounted for
        </p>

        <div>
          <ol className="space-y-0 font-mono text-[13px]" aria-label="Payment intent happy path">
            {HAPPY_PATH.map((state, i) => {
              const isLast = i === HAPPY_PATH.length - 1;
              return (
                <li key={state} className="flex items-stretch gap-5">
                  <div className="flex flex-col items-center">
                    <span
                      className={
                        isLast
                          ? 'size-2.5 rounded-full bg-brand-deep'
                          : 'size-2.5 rounded-full border border-porcelain/40'
                      }
                      aria-hidden="true"
                    />
                    {!isLast && <span className="w-px flex-1 bg-porcelain/20" aria-hidden="true" />}
                  </div>
                  <span className={isLast ? 'pb-0 text-brand-deep' : 'pb-7 text-porcelain/80'}>
                    {state}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-10 max-w-xs text-[15px] leading-relaxed text-porcelain/70">
            A reference on every checkout, verification on-chain, and a webhook on every state —
            while the money moves straight to your wallet.
          </p>
        </div>

        <p className="font-mono text-xs text-porcelain/50">
          No pooled wallets. No withdrawals. No keys on our servers.
        </p>
      </aside>
    </div>
  );
}
