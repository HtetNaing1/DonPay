'use client';

import { useMemo, useState } from 'react';
import type { IntentStatus, IntentSummary } from '@donpay/shared';
import { PaymentRow } from '@/components/molecules/payment-row';
import { SelectField, type SelectOption } from '@/components/molecules/select-field';
import { StatusFilter, type StatusFilterOption } from '@/components/molecules/status-filter';
import { INTENT_STATUS_META } from '@/lib/intent-status';

type StatusValue = IntentStatus | 'ALL';

/** Status chips are ordered by the payment lifecycle, not alphabetically. */
const STATUS_ORDER: IntentStatus[] = [
  'PENDING',
  'DETECTED',
  'CONFIRMED',
  'FINALIZED',
  'UNDERPAID',
  'LATE_PAYMENT',
  'EXPIRED',
  'CREATED',
];

/**
 * The payments ledger: browse intents by state and originating link. Filtering
 * is client-side over the fetched page — instant, and the counts stay honest
 * because they are computed from the same rows.
 */
export function PaymentsWorkspace({
  intents,
  links,
}: {
  intents: IntentSummary[];
  links: { id: string; slug: string }[];
}) {
  const [status, setStatus] = useState<StatusValue>('ALL');
  const [linkFilter, setLinkFilter] = useState<string>('ALL');

  const byLink = useMemo(() => {
    if (linkFilter === 'ALL') return intents;
    if (linkFilter === 'NONE') return intents.filter((intent) => intent.linkId === null);
    return intents.filter((intent) => intent.linkId === linkFilter);
  }, [intents, linkFilter]);

  const statusCounts = useMemo(() => {
    const counts = new Map<IntentStatus, number>();
    for (const intent of byLink) counts.set(intent.status, (counts.get(intent.status) ?? 0) + 1);
    return counts;
  }, [byLink]);

  const statusOptions: StatusFilterOption<StatusValue>[] = [
    { value: 'ALL', label: 'All', count: byLink.length },
    ...STATUS_ORDER.filter((s) => (statusCounts.get(s) ?? 0) > 0).map((s) => ({
      value: s,
      label: INTENT_STATUS_META[s].label,
      count: statusCounts.get(s) ?? 0,
    })),
  ];

  const hasDirect = intents.some((intent) => intent.linkId === null);
  const linkOptions: SelectOption<string>[] = [
    { value: 'ALL', label: 'All links' },
    ...(hasDirect ? [{ value: 'NONE', label: 'Direct API charges' }] : []),
    ...links.map((link) => ({ value: link.id, label: `/pay/${link.slug}` })),
  ];

  // Changing the link filter resets the state chip — the old state may not
  // exist under the new link, and a stale chip would hide the whole list.
  const changeLink = (value: string) => {
    setLinkFilter(value);
    setStatus('ALL');
  };

  const clearFilters = () => {
    setStatus('ALL');
    setLinkFilter('ALL');
  };

  const visible = status === 'ALL' ? byLink : byLink.filter((intent) => intent.status === status);

  return (
    <div className="space-y-4">
      {intents.length > 0 && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">State</span>
            <StatusFilter
              value={status}
              options={statusOptions}
              onChange={setStatus}
              ariaLabel="Filter payments by state"
            />
          </div>
          {linkOptions.length > 1 && (
            <SelectField
              label="Link"
              value={linkFilter}
              onChange={changeLink}
              options={linkOptions}
              className="w-full sm:w-60"
            />
          )}
        </div>
      )}

      <section
        aria-label="Payments"
        className="overflow-hidden rounded-xl border border-hairline bg-surface"
      >
        {intents.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-mono text-[13px] text-ink-soft">No payments yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft/80">
              Every checkout that opens takes a row here. Share a payment link to see your first
              one land.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-mono text-[13px] text-ink-soft">No payments match</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft/80">
              Nothing here with these filters. Clear them to see the full ledger.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 inline-flex h-9 cursor-pointer items-center rounded-md border border-hairline bg-surface px-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-brand/40 hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {visible.map((intent) => (
              <li key={intent.id}>
                <PaymentRow intent={intent} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
