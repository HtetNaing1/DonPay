'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PublicLink,
  fiatMajorToMinor,
  fiatMinorToMajor,
} from '@donpay/shared';
import { cn } from '@/lib/utils';

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
}

/**
 * The action half of `/pay/[slug]`: collects an amount when the link leaves
 * it to the payer, creates the intent on an explicit click (never on page
 * load — a crawler must not mint intents), and moves on to the checkout
 * ticket. The API is the validator of record; this only converts units and
 * surfaces its answers.
 */
export function OpenLinkPanel({ link }: { link: PublicLink }) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const choosing = link.amountMode === 'PAYER_CHOOSES';

  const bounds = [
    link.minFiat !== null
      ? `at least ${fiatMinorToMajor(link.minFiat, link.fiatCurrency)}`
      : null,
    link.maxFiat !== null
      ? `up to ${fiatMinorToMajor(link.maxFiat, link.fiatCurrency)}`
      : null,
  ]
    .filter(Boolean)
    .join(', ');

  const proceed = async () => {
    setError(null);
    let amountFiat: number | undefined;
    if (choosing) {
      try {
        amountFiat = fiatMajorToMinor(amount, link.fiatCurrency);
        if (amountFiat <= 0) throw new Error();
      } catch {
        setError(`Enter a valid ${link.fiatCurrency} amount`);
        return;
      }
    }

    setBusy(true);
    try {
      const response = await fetch(
        `${apiBase()}/checkout/links/${link.slug}/intents`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(choosing ? { amountFiat } : {}),
        },
      );
      const body = (await response.json()) as { id?: string; detail?: string };
      if (!response.ok || !body.id) {
        setError(body.detail ?? 'Something went wrong — try again');
        setBusy(false);
        return;
      }
      router.push(`/checkout/${body.id}`);
    } catch {
      setError('Could not reach the payment server — try again');
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void proceed();
      }}
      className="px-5 py-5"
    >
      {choosing && (
        <div>
          <label
            htmlFor="amount"
            className="font-mono text-[11px] tracking-widest text-ink-soft uppercase"
          >
            Amount ({link.fiatCurrency})
          </label>
          <input
            id="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder={link.minFiat !== null ? fiatMinorToMajor(link.minFiat, link.fiatCurrency) : '0'}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 font-mono text-lg text-ink placeholder:text-ink-soft/50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
          />
          {bounds && (
            <p className="mt-1.5 font-mono text-[11.5px] text-ink-soft">
              {bounds} {link.fiatCurrency}
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[12.5px] leading-snug text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className={cn(
          'mt-4 flex w-full items-center justify-center rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          busy && 'cursor-wait opacity-70',
        )}
      >
        {busy ? 'Preparing your checkout…' : 'Continue to payment'}
      </button>
      <p className="mt-3 text-center font-mono text-[11px] text-ink-soft/80">
        Next: a QR code to pay from your Solana wallet
      </p>
    </form>
  );
}
