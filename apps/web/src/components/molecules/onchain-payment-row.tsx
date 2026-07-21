import { type OnchainPaymentView, type PayToken, tokenMinorToMajor } from '@donpay/shared';
import { explorerTxUrl, shortHash } from '@/lib/intent-status';
import { relativeTime } from '@/lib/utils';

/** One on-chain transfer the watcher matched — links out to the explorer. */
export function OnchainPaymentRow({
  payment,
  token,
}: {
  payment: OnchainPaymentView;
  token: PayToken;
}) {
  const settledAt = payment.finalizedAt ?? payment.detectedAt;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3">
      <div className="min-w-0 flex-1">
        <a
          href={explorerTxUrl(payment.txSignature)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[13px] text-brand-deep underline decoration-brand-deep/40 underline-offset-2 hover:decoration-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {shortHash(payment.txSignature, 8, 6)} ↗
        </a>
        <p className="mt-0.5 font-mono text-[11px] text-ink-soft">
          from {shortHash(payment.payerAddress)} · slot {payment.slot}
        </p>
      </div>

      <div className="font-mono text-sm text-ink">
        {tokenMinorToMajor(BigInt(payment.amountToken), token)} {token}
      </div>

      <time
        dateTime={settledAt}
        title={new Date(settledAt).toLocaleString()}
        className="w-32 text-right text-[13px] text-ink-soft"
      >
        {payment.finalizedAt ? 'finalized' : 'seen'} {relativeTime(settledAt)}
      </time>
    </div>
  );
}
