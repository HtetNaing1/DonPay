'use client';

import { useMemo, useState } from 'react';
import type { WebhookEndpointView } from '@donpay/shared';
import { Plus, X } from 'lucide-react';
import {
  StatusFilter,
  type StatusFilterOption,
} from '@/components/molecules/status-filter';
import { WebhookCreatePanel } from '@/components/organisms/webhook-create-panel';
import { WebhookEndpointsTable } from '@/components/organisms/webhook-endpoints-table';

type Filter = 'ALL' | 'ACTIVE' | 'DISABLED';

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DISABLED', label: 'Disabled' },
];

const FILTER_LABEL = Object.fromEntries(FILTERS.map((f) => [f.value, f.label])) as Record<
  Filter,
  string
>;

/**
 * The webhooks surface: add an endpoint on demand and browse the list by state.
 * The form stays hidden until the person asks for it, so the page opens on
 * what they came to see — their endpoints and delivery logs.
 */
export function WebhooksWorkspace({ endpoints }: { endpoints: WebhookEndpointView[] }) {
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>('ALL');

  const counts = useMemo(() => {
    const tally: Record<Filter, number> = {
      ALL: endpoints.length,
      ACTIVE: 0,
      DISABLED: 0,
    };
    for (const endpoint of endpoints) tally[endpoint.active ? 'ACTIVE' : 'DISABLED'] += 1;
    return tally;
  }, [endpoints]);

  const options: StatusFilterOption<Filter>[] = FILTERS.map((f) => ({
    ...f,
    count: counts[f.value],
  }));

  const visible =
    filter === 'ALL'
      ? endpoints
      : endpoints.filter((e) => (e.active ? 'ACTIVE' : 'DISABLED') === filter);
  const hasEndpoints = endpoints.length > 0;

  const emptyState = hasEndpoints ? (
    <div className="px-6 py-14 text-center">
      <p className="font-mono text-[13px] text-ink-soft">
        No {FILTER_LABEL[filter].toLowerCase()} endpoints
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft/80">
        Nothing here right now. Switch filters to see the rest of your endpoints.
      </p>
      <button
        type="button"
        onClick={() => setFilter('ALL')}
        className="mt-4 inline-flex h-9 cursor-pointer items-center rounded-md border border-hairline bg-surface px-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-brand/40 hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Show all endpoints
      </button>
    </div>
  ) : (
    <div className="px-6 py-14 text-center">
      <p className="font-mono text-[13px] text-ink-soft">No endpoints yet</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft/80">
        Add one to get a signed POST the moment a payment changes state — no polling.
      </p>
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="mt-4 inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground transition-colors duration-200 hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Plus className="size-4" aria-hidden="true" />
        New endpoint
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {hasEndpoints ? (
          <StatusFilter value={filter} options={options} onChange={setFilter} />
        ) : (
          <span aria-hidden="true" />
        )}

        <button
          type="button"
          onClick={() => setCreating((open) => !open)}
          aria-expanded={creating}
          aria-controls="webhook-create-region"
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
              New endpoint
            </>
          )}
        </button>
      </div>

      {creating && (
        <div id="webhook-create-region" className="rise-in">
          <WebhookCreatePanel onCancel={() => setCreating(false)} />
        </div>
      )}

      <section
        aria-label="Your endpoints"
        className="overflow-hidden rounded-xl border border-hairline bg-surface"
      >
        <WebhookEndpointsTable endpoints={visible} emptyState={emptyState} />
      </section>
    </div>
  );
}
