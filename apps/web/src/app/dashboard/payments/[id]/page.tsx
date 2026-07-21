import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { type IntentDetail, fiatMinorToMajor, tokenMinorToMajor } from '@donpay/shared';
import { ArrowLeft } from 'lucide-react';
import { CopyButton } from '@/components/atoms/copy-button';
import { IntentStatusBadge } from '@/components/molecules/intent-status-badge';
import { IntentTimeline } from '@/components/molecules/intent-timeline';
import { OnchainPaymentRow } from '@/components/molecules/onchain-payment-row';
import { INTENT_FLAG_LABEL, explorerAddressUrl, shortHash } from '@/lib/intent-status';
import { merchantApiFetch } from '@/lib/api-server';

export const metadata: Metadata = {
  title: 'Payment — DonPay',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await merchantApiFetch<IntentDetail>(`/merchants/me/intents/${id}`);
  if (!result.ok) notFound();
  const intent = result.data;

  return (
    <div className="space-y-8">
      <div className="rise-in">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft transition-colors duration-200 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Payments
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <IntentStatusBadge status={intent.status} />
          {intent.flags.map((flag) => (
            <span
              key={flag}
              className="rounded-full border border-pend/40 px-2 py-0.5 font-mono text-[10px] tracking-wider text-pend uppercase"
            >
              {INTENT_FLAG_LABEL[flag]}
            </span>
          ))}
        </div>

        <p className="mt-3 font-mono text-4xl font-medium tracking-tight text-ink">
          {fiatMinorToMajor(intent.amountFiat, intent.fiatCurrency)}
          <span className="ml-2 text-lg font-normal text-ink-soft">{intent.fiatCurrency}</span>
        </p>
        <p className="mt-1 font-mono text-sm text-ink-soft">
          = {tokenMinorToMajor(BigInt(intent.amountToken), intent.token)} {intent.token}
          <span className="text-ink-soft/70"> · rate locked at creation</span>
        </p>
        <p className="mt-2 flex items-center gap-1 font-mono text-[13px] text-ink-soft">
          <span title={intent.reference}>ref {shortHash(intent.reference, 6, 6)}</span>
          <CopyButton value={intent.reference} label="Copy reference" className="p-1.5" />
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <section
          aria-labelledby="timeline-heading"
          className="rise-in overflow-hidden rounded-xl border border-hairline bg-surface"
          style={{ '--rise-order': 1 } as React.CSSProperties}
        >
          <div className="border-b border-hairline px-6 py-4">
            <h2 id="timeline-heading" className="font-display text-lg tracking-tight">
              Timeline
            </h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              Every state change the watcher wrote, in order.
            </p>
          </div>
          <div className="px-6 py-5">
            <IntentTimeline transitions={intent.transitions} createdAt={intent.createdAt} />
          </div>
        </section>

        <div className="space-y-6">
          <section
            aria-labelledby="details-heading"
            className="rise-in overflow-hidden rounded-xl border border-hairline bg-surface"
            style={{ '--rise-order': 2 } as React.CSSProperties}
          >
            <div className="border-b border-hairline px-6 py-4">
              <h2 id="details-heading" className="font-display text-lg tracking-tight">
                Details
              </h2>
            </div>
            <dl className="divide-y divide-hairline">
              <DetailRow label="Source">
                {intent.linkSlug ? (
                  <a
                    href={`/pay/${intent.linkSlug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-brand-deep underline decoration-brand-deep/40 underline-offset-2 hover:decoration-brand-deep"
                  >
                    /pay/{intent.linkSlug} ↗
                  </a>
                ) : (
                  'Direct API charge'
                )}
              </DetailRow>
              <DetailRow label="Pays out to">
                <span className="inline-flex items-center gap-1">
                  <a
                    href={explorerAddressUrl(intent.payoutAddress)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-brand-deep underline decoration-brand-deep/40 underline-offset-2 hover:decoration-brand-deep"
                    title={intent.payoutAddress}
                  >
                    {shortHash(intent.payoutAddress)} ↗
                  </a>
                  <CopyButton
                    value={intent.payoutAddress}
                    label="Copy payout address"
                    className="-my-1 p-1.5"
                  />
                </span>
              </DetailRow>
              <DetailRow label="Locked rate">
                <span className="font-mono">
                  1 {intent.token} = {intent.rate} {intent.fiatCurrency}
                </span>
              </DetailRow>
              <DetailRow label="Rate source">{intent.rateSource}</DetailRow>
              <DetailRow label="Quote expired">{formatDateTime(intent.quoteExpiresAt)}</DetailRow>
              <DetailRow label="Checkout link">
                <span className="inline-flex items-center gap-1">
                  <span className="font-mono text-[12px] text-ink-soft">{`/checkout/${intent.id}`}</span>
                  <CopyButton
                    value={intent.checkoutUrl}
                    label="Copy checkout link"
                    className="-my-1 p-1.5"
                  />
                </span>
              </DetailRow>
              {intent.note && <DetailRow label="Note">{intent.note}</DetailRow>}
              <DetailRow label="Created">{formatDateTime(intent.createdAt)}</DetailRow>
            </dl>
          </section>

          <section
            aria-labelledby="onchain-heading"
            className="rise-in overflow-hidden rounded-xl border border-hairline bg-surface"
            style={{ '--rise-order': 3 } as React.CSSProperties}
          >
            <div className="flex items-baseline justify-between border-b border-hairline px-6 py-4">
              <h2 id="onchain-heading" className="font-display text-lg tracking-tight">
                On-chain payments
              </h2>
              <span className="font-mono text-[11px] tracking-widest text-ink-soft/70 uppercase">
                {intent.payments.length} seen
              </span>
            </div>
            {intent.payments.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-ink-soft">
                No transfers matched this reference yet.
              </p>
            ) : (
              <ul className="divide-y divide-hairline">
                {intent.payments.map((payment) => (
                  <li key={payment.txSignature}>
                    <OnchainPaymentRow payment={payment} token={intent.token} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 py-3.5">
      <dt className="shrink-0 text-sm text-ink-soft">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-ink">{children}</dd>
    </div>
  );
}
