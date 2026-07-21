import type { Metadata } from 'next';
import type { WebhookEndpointView } from '@donpay/shared';
import { WebhookCreatePanel } from '@/components/organisms/webhook-create-panel';
import { WebhookEndpointsTable } from '@/components/organisms/webhook-endpoints-table';
import { merchantApiFetch } from '@/lib/api-server';

export const metadata: Metadata = {
  title: 'Webhooks — DonPay',
};

export default async function WebhooksPage() {
  const result = await merchantApiFetch<WebhookEndpointView[]>('/merchants/me/webhooks');
  const endpoints = result.ok ? result.data : [];

  return (
    <div className="space-y-8">
      <div className="rise-in">
        <h1 className="font-display text-3xl tracking-tight">Webhooks</h1>
        <p className="mt-1.5 text-[15px] text-ink-soft">
          Get a signed POST the moment a payment changes state — no polling. Each endpoint is
          signed with its own secret, retries on failure, and keeps a delivery log you can replay.
        </p>
      </div>

      <div className="rise-in" style={{ '--rise-order': 1 } as React.CSSProperties}>
        <WebhookCreatePanel />
      </div>

      <section
        aria-labelledby="webhooks-heading"
        className="rise-in"
        style={{ '--rise-order': 2 } as React.CSSProperties}
      >
        <h2 id="webhooks-heading" className="font-display text-lg tracking-tight">
          Your endpoints
        </h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-hairline bg-surface">
          <WebhookEndpointsTable endpoints={endpoints} />
        </div>
      </section>
    </div>
  );
}
