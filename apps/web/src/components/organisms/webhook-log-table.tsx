'use client';

import { useEffect, useState } from 'react';
import type { WebhookDeliveryView } from '@donpay/shared';
import { listWebhookDeliveries, redeliverWebhook } from '@/app/dashboard/webhooks/actions';
import { WebhookDeliveryRow } from '@/components/molecules/webhook-delivery-row';

type LoadState = 'loading' | 'error' | 'ready';

/**
 * The delivery log for one endpoint. Loaded on demand when the log opens, so
 * an endpoint list with many endpoints stays cheap. Redeliver updates the row
 * in place with the queued attempt the API returns.
 */
export function WebhookLogTable({ endpointId }: { endpointId: string }) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [deliveries, setDeliveries] = useState<WebhookDeliveryView[]>([]);
  const [queuing, setQueuing] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadState('loading');
    void listWebhookDeliveries(endpointId).then((result) => {
      if (!active) return;
      if (result.ok) {
        setDeliveries(result.data);
        setLoadState('ready');
      } else {
        setLoadState('error');
      }
    });
    return () => {
      active = false;
    };
  }, [endpointId]);

  const handleRedeliver = async (deliveryId: string) => {
    if (queuing) return;
    setQueuing(deliveryId);
    const result = await redeliverWebhook(deliveryId);
    setQueuing(null);
    if (result.ok) {
      setDeliveries((rows) =>
        rows.map((row) => (row.id === deliveryId ? result.data : row)),
      );
    }
  };

  if (loadState === 'loading') {
    return <p className="px-5 py-6 font-mono text-[13px] text-ink-soft">Loading deliveries…</p>;
  }

  if (loadState === 'error') {
    return (
      <p className="px-5 py-6 text-[13px] text-destructive">
        Couldn’t load deliveries. Refresh to try again.
      </p>
    );
  }

  if (deliveries.length === 0) {
    return (
      <div className="px-5 py-8 text-center">
        <p className="font-mono text-[13px] text-ink-soft">No deliveries yet</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-soft/80">
          Deliveries land here as your intents change state. Send a devnet payment to see the first one.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-hairline">
      {deliveries.map((delivery) => (
        <li key={delivery.id}>
          <WebhookDeliveryRow
            delivery={delivery}
            action={
              delivery.status !== 'PENDING' && (
                <button
                  type="button"
                  onClick={() => void handleRedeliver(delivery.id)}
                  disabled={queuing !== null}
                  className="h-8 shrink-0 cursor-pointer rounded-md border border-hairline bg-surface px-3 text-[13px] font-medium text-ink transition-colors duration-200 hover:border-brand/40 hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-60"
                >
                  {queuing === delivery.id ? 'Queuing…' : 'Redeliver'}
                </button>
              )
            }
          />
        </li>
      ))}
    </ul>
  );
}
