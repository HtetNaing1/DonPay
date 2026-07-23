import Link from 'next/link';
import { type IntentSummary, fiatMinorToMajor, tokenMinorToMajor } from '@donpay/shared';
import { IntentStatusBadge } from '@/components/molecules/intent-status-badge';
import { INTENT_FLAG_LABEL, shortHash } from '@/lib/intent-status';
import { relativeTime } from '@/lib/utils';

/** One payment in the ledger — links through to the intent's detail page. */
export function PaymentRow({ intent }: { intent: IntentSummary }) {
  return (
    <Link
      href={`/dashboard/payments/${intent.id}`}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4 transition-colors duration-200 hover:bg-brand/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
    >
      <div className="min-w-0 flex-1 basis-56">
        <p className="flex items-center gap-2 font-mono text-[13px] text-ink">
          <span className="truncate" title={intent.reference}>
            {shortHash(intent.reference, 6, 6)}
          </span>
          {intent.flags.map((flag) => (
            <span
              key={flag}
              className="rounded-full border border-pend/40 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-pend uppercase"
            >
              {INTENT_FLAG_LABEL[flag]}
            </span>
          ))}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-ink-soft">{intent.note ?? '—'}</p>
      </div>

      <div className="hidden w-28 sm:block">
        <span className="inline-flex items-center rounded-full border border-hairline px-2 py-0.5 text-[11px] font-medium text-ink-soft">
          {intent.linkId ? 'Link' : 'Direct API'}
        </span>
      </div>

      <div className="w-32 text-sm text-ink tabular-nums">
        {fiatMinorToMajor(intent.amountFiat, intent.fiatCurrency)}
        <span className="text-ink-soft"> {intent.fiatCurrency}</span>
        <p className="mt-0.5 font-mono text-[11px] text-ink-soft/70">
          {tokenMinorToMajor(BigInt(intent.amountToken), intent.token)} {intent.token}
        </p>
      </div>

      <div className="w-32">
        <IntentStatusBadge status={intent.status} />
      </div>

      <time
        dateTime={intent.createdAt}
        title={new Date(intent.createdAt).toLocaleString()}
        className="w-24 text-right text-[13px] text-ink-soft tabular-nums"
      >
        {relativeTime(intent.createdAt)}
      </time>
    </Link>
  );
}
