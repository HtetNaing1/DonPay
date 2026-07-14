import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  title: string;
  copy: string;
  status: 'done' | 'current' | 'locked';
  action?: { label: string; href?: string };
}

/**
 * Onboarding is a real sequence — each step unlocks the next — so the
 * numbering carries information.
 */
function buildSteps(walletVerified: boolean, hasLink: boolean): Step[] {
  return [
    {
      title: 'Create your account',
      copy: 'Your merchant account is live on devnet.',
      status: 'done',
    },
    {
      title: 'Verify a payout wallet',
      copy: 'Sign a one-time message with your Phantom wallet to prove you own the address payments will settle to.',
      status: walletVerified ? 'done' : 'current',
      action: walletVerified
        ? undefined
        : { label: 'Verify wallet', href: '/dashboard/wallets' },
    },
    {
      title: 'Create your first payment link',
      copy: 'A shareable URL and QR code that opens a hosted checkout paying your verified wallet.',
      status: hasLink ? 'done' : walletVerified ? 'current' : 'locked',
      action: hasLink ? undefined : { label: 'Create link', href: '/dashboard/links' },
    },
  ];
}

interface OnboardingStepsProps {
  walletVerified: boolean;
  hasLink: boolean;
}

export function OnboardingSteps({ walletVerified, hasLink }: OnboardingStepsProps) {
  const steps = buildSteps(walletVerified, hasLink);
  const remaining = steps.filter((step) => step.status !== 'done').length;
  return (
    <section
      aria-labelledby="onboarding-heading"
      className="overflow-hidden rounded-xl border border-hairline bg-surface"
    >
      <div className="border-b border-hairline px-6 py-4">
        <h2 id="onboarding-heading" className="font-display text-lg tracking-tight">
          Get set up
        </h2>
        <p className="mt-0.5 text-sm text-ink-soft">
          {remaining === 0
            ? 'You’re set up — share a link and payments will land in the ledger below.'
            : remaining === 1
              ? 'One step between you and your first devnet payment.'
              : 'Two steps between you and your first devnet payment.'}
        </p>
      </div>
      <ol className="divide-y divide-hairline">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="rise-in flex gap-4 px-6 py-5"
            style={{ '--rise-order': i + 1 } as React.CSSProperties}
          >
            <span
              className={cn(
                'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-[13px]',
                step.status === 'done' && 'bg-brand text-brand-foreground',
                step.status === 'current' && 'border border-brand text-brand-deep',
                step.status === 'locked' && 'border border-hairline text-ink-soft/60',
              )}
              aria-hidden="true"
            >
              {step.status === 'done' ? <Check className="size-4" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <h3
                className={cn(
                  'text-[15px] font-medium',
                  step.status === 'locked' ? 'text-ink-soft' : 'text-ink',
                )}
              >
                {step.title}
              </h3>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-soft">{step.copy}</p>
            </div>
            {step.action &&
              (step.action.href ? (
                <Link
                  href={step.action.href}
                  className="flex h-9 shrink-0 items-center self-center rounded-md bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-colors duration-200 hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {step.action.label}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Available soon in this devnet build"
                  className="h-9 shrink-0 self-center rounded-md border border-hairline bg-surface px-3.5 text-sm font-medium text-ink-soft/60"
                >
                  {step.action.label}
                </button>
              ))}
          </li>
        ))}
      </ol>
    </section>
  );
}
