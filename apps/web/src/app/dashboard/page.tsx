import type { Metadata } from 'next';
import { auth } from '@/auth';
import { OnboardingSteps } from '@/components/organisms/onboarding-steps';

export const metadata: Metadata = {
  title: 'Payments — DonPay',
};

export default async function DashboardPage() {
  const session = await auth();
  const firstName = session?.user?.name?.split(' ')[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight">
          {firstName ? `Welcome, ${firstName}` : 'Welcome'}
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-soft">
          Finish setup below — payments appear here the moment a checkout opens.
        </p>
      </div>

      <OnboardingSteps />

      <section aria-labelledby="payments-heading">
        <div className="flex items-baseline justify-between">
          <h2 id="payments-heading" className="font-display text-lg tracking-tight">
            Payments
          </h2>
          <p className="font-mono text-[11px] tracking-widest text-ink-soft/70 uppercase">
            Live from the chain watcher
          </p>
        </div>
        <div className="mt-3 overflow-hidden rounded-xl border border-hairline bg-surface">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-hairline px-6 py-3 font-mono text-[11px] tracking-widest text-ink-soft/70 uppercase sm:grid-cols-[1fr_1fr_auto_auto]">
            <span>Reference</span>
            <span className="hidden sm:block">Link</span>
            <span>Amount</span>
            <span>State</span>
          </div>
          <div className="px-6 py-14 text-center">
            <p className="font-mono text-[13px] text-ink-soft">No payments yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft/80">
              Verify a payout wallet and create a payment link — every checkout that opens will
              take a row in this ledger.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
