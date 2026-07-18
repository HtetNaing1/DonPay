import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicLink, fiatMinorToMajor } from '@donpay/shared';
import { Wordmark } from '@/components/atoms/wordmark';
import { OpenLinkPanel } from '@/components/organisms/open-link-panel';
import { apiUrl } from '@/lib/api';

interface PayPageProps {
  params: Promise<{ slug: string }>;
}

async function fetchLink(slug: string): Promise<PublicLink | null> {
  const response = await fetch(apiUrl(`/checkout/links/${slug}`), {
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return (await response.json()) as PublicLink;
}

export async function generateMetadata({ params }: PayPageProps): Promise<Metadata> {
  const { slug } = await params;
  const link = await fetchLink(slug);
  return {
    title: link ? `Pay ${link.merchantName} — DonPay` : 'Payment link — DonPay',
    robots: { index: false },
  };
}

const CLOSED_COPY: Record<string, string> = {
  PAUSED: 'has been paused by the merchant',
  EXPIRED: 'has expired',
  COMPLETED: 'was already used — this was a one-time payment',
};

/**
 * `/pay/[slug]`: the front door of a payment link. Shows the terms, takes an
 * amount when the payer chooses one, and only mints the intent (rate lock,
 * reference, watcher) on the explicit continue — then hands over to
 * `/checkout/[intentId]`.
 */
export default async function PayPage({ params }: PayPageProps) {
  const { slug } = await params;
  const link = await fetchLink(slug);
  if (!link) notFound();

  const open = link.status === 'ACTIVE';

  return (
    <main className="flex min-h-dvh flex-col items-center bg-paper px-4 pt-10 pb-16">
      <Wordmark className="mb-6 text-xl text-ink" />
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-hairline bg-surface shadow-[0_24px_48px_-24px_rgba(20,32,27,0.25)]">
          <div className="border-b border-dashed border-hairline px-5 py-3.5">
            <span className="font-mono text-[11px] tracking-widest text-ink-soft uppercase">
              Payment link
            </span>
          </div>

          <div className="px-5 pt-4 pb-4">
            <h1 className="font-display text-xl text-ink">
              Pay {link.merchantName}
            </h1>
            {link.note && <p className="mt-0.5 text-sm text-ink-soft">{link.note}</p>}
            {link.amountMode === 'FIXED' && link.amountFiat !== null ? (
              <p className="mt-3 font-mono text-3xl font-medium tracking-tight text-ink">
                {fiatMinorToMajor(link.amountFiat, link.fiatCurrency)}
                <span className="ml-1.5 text-base font-normal text-ink-soft">
                  {link.fiatCurrency}
                </span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-ink-soft">
                You choose the amount — it will be converted to {link.token} at
                the moment you continue.
              </p>
            )}
            <p className="mt-1 font-mono text-[13px] text-ink-soft">
              paid in {link.token} on Solana
            </p>
          </div>

          <div className="border-t border-dashed border-hairline">
            {open ? (
              <OpenLinkPanel link={link} />
            ) : (
              <div className="px-5 py-6 text-center">
                <p className="font-display text-lg text-ink">
                  This link is closed
                </p>
                <p className="mx-auto mt-2 max-w-[36ch] text-[12.5px] leading-snug text-ink-soft">
                  This payment link {CLOSED_COPY[link.status] ?? 'no longer accepts payments'}.
                  Nothing was charged. Ask {link.merchantName} for a new link if
                  you still need to pay.
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 text-center font-mono text-[11px] text-ink-soft/80">
          Powered by DonPay · non-custodial — funds go directly to{' '}
          {link.merchantName}
        </p>
      </div>
    </main>
  );
}
