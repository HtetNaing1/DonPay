'use client';

import { useMemo, useState } from 'react';
import type { PaymentLinkView } from '@donpay/shared';
import { Plus, X } from 'lucide-react';
import {
  LinkStatusFilter,
  type StatusFilterOption,
} from '@/components/molecules/link-status-filter';
import { LinkForm } from '@/components/organisms/link-form';
import { LinksTable } from '@/components/organisms/links-table';

type LinkStatus = PaymentLinkView['status'];
type Filter = LinkStatus | 'ALL';

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'EXPIRED', label: 'Expired' },
];

const FILTER_LABEL = Object.fromEntries(FILTERS.map((f) => [f.value, f.label])) as Record<
  Filter,
  string
>;

/**
 * The links surface: create a link on demand and browse the list by status.
 * The form stays hidden until the person asks for it, so the page opens on
 * what they came to see — their links.
 */
export function LinksWorkspace({ links }: { links: PaymentLinkView[] }) {
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>('ALL');

  const counts = useMemo(() => {
    const tally: Record<Filter, number> = {
      ALL: links.length,
      ACTIVE: 0,
      PAUSED: 0,
      COMPLETED: 0,
      EXPIRED: 0,
    };
    for (const link of links) tally[link.status] += 1;
    return tally;
  }, [links]);

  const options: StatusFilterOption<Filter>[] = FILTERS.map((f) => ({
    ...f,
    count: counts[f.value],
  }));

  const visible = filter === 'ALL' ? links : links.filter((link) => link.status === filter);
  const hasLinks = links.length > 0;

  const emptyState = hasLinks ? (
    <div className="px-6 py-14 text-center">
      <p className="font-mono text-[13px] text-ink-soft">
        No {FILTER_LABEL[filter].toLowerCase()} links
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft/80">
        Nothing here right now. Switch filters to see the rest of your links.
      </p>
      <button
        type="button"
        onClick={() => setFilter('ALL')}
        className="mt-4 inline-flex h-9 cursor-pointer items-center rounded-md border border-hairline bg-surface px-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-brand/40 hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Show all links
      </button>
    </div>
  ) : (
    <div className="px-6 py-14 text-center">
      <p className="font-mono text-[13px] text-ink-soft">No payment links yet</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft/80">
        Create one to share a hosted checkout — payments land straight in your ledger.
      </p>
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="mt-4 inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground transition-colors duration-200 hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Plus className="size-4" aria-hidden="true" />
        New link
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {hasLinks ? (
          <LinkStatusFilter value={filter} options={options} onChange={setFilter} />
        ) : (
          <span aria-hidden="true" />
        )}

        <button
          type="button"
          onClick={() => setCreating((open) => !open)}
          aria-expanded={creating}
          aria-controls="link-create-region"
          className={
            creating
              ? 'inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-hairline bg-surface px-4 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink-soft/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
              : 'inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground transition-colors duration-200 hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
          }
        >
          {creating ? (
            <>
              <X className="size-4" aria-hidden="true" />
              Close
            </>
          ) : (
            <>
              <Plus className="size-4" aria-hidden="true" />
              New link
            </>
          )}
        </button>
      </div>

      {creating && (
        <div id="link-create-region" className="rise-in">
          <LinkForm onCancel={() => setCreating(false)} />
        </div>
      )}

      <section
        aria-label="Your payment links"
        className="overflow-hidden rounded-xl border border-hairline bg-surface"
      >
        <LinksTable links={visible} emptyState={emptyState} />
      </section>
    </div>
  );
}
