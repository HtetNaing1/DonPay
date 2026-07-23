'use client';

import { useState } from 'react';
import type { WebhookEndpointView } from '@donpay/shared';
import { ChevronDown, Trash2 } from 'lucide-react';
import {
  deleteWebhookEndpoint,
  setWebhookActive,
} from '@/app/dashboard/webhooks/actions';
import { ConfirmDialog } from '@/components/molecules/confirm-dialog';
import { WebhookEndpointRow } from '@/components/molecules/webhook-endpoint-row';
import { WebhookLogTable } from '@/components/organisms/webhook-log-table';
import { cn } from '@/lib/utils';

/** Merchant's endpoints with enable/disable, delete, and an expandable log. */
export function WebhookEndpointsTable({
  endpoints,
  emptyState,
}: {
  endpoints: WebhookEndpointView[];
  /** Shown in place of rows when the list is empty (owner tailors the copy). */
  emptyState?: React.ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<WebhookEndpointView | null>(null);

  if (endpoints.length === 0) {
    return (
      <>
        {emptyState ?? (
          <div className="px-6 py-14 text-center">
            <p className="font-mono text-[13px] text-ink-soft">No endpoints yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft/80">
              Add your first endpoint — DonPay will POST a signed event there each time a payment
              changes state.
            </p>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title="Delete this endpoint?"
        destructive
        confirmLabel="Delete endpoint"
        onConfirm={async () => {
          if (!toDelete) return;
          await deleteWebhookEndpoint(toDelete.id);
          setToDelete(null);
        }}
        message={
          <>
            <span className="font-mono text-ink">{toDelete?.url}</span> will stop receiving
            events, and its delivery history is removed. Your signing secret is retired with it —
            a new endpoint gets a new one. This can’t be undone.
          </>
        }
      />
      <ul className="divide-y divide-hairline">
        {endpoints.map((endpoint) => {
          const open = openId === endpoint.id;
          return (
            <li key={endpoint.id}>
              <WebhookEndpointRow
                endpoint={endpoint}
                action={
                  <span className="flex shrink-0 items-center gap-1.5">
                    <form
                      action={setWebhookActive.bind(null, endpoint.id, !endpoint.active)}
                    >
                      <button
                        type="submit"
                        className="h-9 w-20 shrink-0 cursor-pointer rounded-md border border-hairline bg-surface text-sm font-medium text-ink transition-colors duration-200 hover:border-brand/40 hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      >
                        {endpoint.active ? 'Disable' : 'Enable'}
                      </button>
                    </form>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : endpoint.id)}
                      aria-expanded={open}
                      className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 text-sm font-medium text-ink transition-colors duration-200 hover:border-brand/40 hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      Deliveries
                      <ChevronDown
                        className={cn(
                          'size-4 transition-transform duration-200 motion-reduce:transition-none',
                          open && 'rotate-180',
                        )}
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete endpoint"
                      title="Delete endpoint"
                      onClick={() => setToDelete(endpoint)}
                      className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-hairline bg-surface text-ink-soft transition-colors duration-200 hover:border-destructive/40 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </span>
                }
              />
              {open && (
                <div className="border-t border-hairline bg-paper">
                  <WebhookLogTable endpointId={endpoint.id} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
