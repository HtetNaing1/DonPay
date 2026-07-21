import type { WebhookEndpointView } from '@donpay/shared';
import { CopyButton } from '@/components/atoms/copy-button';
import { StatusDot } from '@/components/atoms/status-dot';
import { WEBHOOK_EVENT_LABEL } from '@/lib/webhook-events';

interface WebhookEndpointRowProps {
  endpoint: WebhookEndpointView;
  /** Row-level controls (toggle, delivery log, delete) rendered by the owner. */
  action?: React.ReactNode;
}

/** One endpoint: destination URL + copy, subscribed events, active state. */
export function WebhookEndpointRow({ endpoint, action }: WebhookEndpointRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4">
      <div className="min-w-0 flex-1 basis-64">
        <p className="flex items-center gap-1 font-mono text-[13px] text-ink">
          <span className="truncate" title={endpoint.url}>
            {endpoint.url}
          </span>
          <CopyButton value={endpoint.url} label="Copy endpoint URL" className="p-1.5" />
        </p>
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {endpoint.events.map((event) => (
            <li
              key={event}
              title={event}
              className="rounded-full border border-hairline px-2 py-0.5 text-[11px] text-ink-soft"
            >
              {WEBHOOK_EVENT_LABEL[event]}
            </li>
          ))}
        </ul>
      </div>

      <p className="flex w-24 items-center gap-2 text-[13px] text-ink-soft">
        <StatusDot tone={endpoint.active ? 'success' : 'idle'} pulse={endpoint.active} />
        {endpoint.active ? 'Active' : 'Paused'}
      </p>

      {action}
    </div>
  );
}
