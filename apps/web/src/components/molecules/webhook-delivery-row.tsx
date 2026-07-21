import type { WebhookDeliveryView } from '@donpay/shared';
import { StatusDot } from '@/components/atoms/status-dot';
import { DELIVERY_STATUS, WEBHOOK_EVENT_LABEL } from '@/lib/webhook-events';

interface WebhookDeliveryRowProps {
  delivery: WebhookDeliveryView;
  /** Redeliver control rendered by the owner (only for finished attempts). */
  action?: React.ReactNode;
}

/** One delivery attempt: event, outcome, last response code, and timing. */
export function WebhookDeliveryRow({ delivery, action }: WebhookDeliveryRowProps) {
  const status = DELIVERY_STATUS[delivery.status];
  const sub = subline(delivery);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-[13px] font-medium text-ink">
          {WEBHOOK_EVENT_LABEL[delivery.event]}
        </p>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-ink-soft">
          <span className="shrink-0">{delivery.event}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate" title={`Intent ${delivery.intentId}`}>
            {delivery.intentId}
          </span>
        </p>
      </div>

      <div className="w-32">
        <p className="flex items-center gap-2 text-[13px] text-ink-soft">
          <StatusDot tone={status.tone} pulse={delivery.status === 'PENDING'} />
          {status.label}
        </p>
        {sub && <p className="mt-0.5 pl-4 text-[11px] text-ink-soft/70">{sub}</p>}
      </div>

      <p className="w-20 font-mono text-[13px] text-ink-soft">
        {delivery.lastResponseCode === null ? '—' : `HTTP ${delivery.lastResponseCode}`}
      </p>

      <p
        className="w-24 text-[13px] text-ink-soft"
        title={new Date(delivery.createdAt).toLocaleString()}
      >
        {fromNow(delivery.createdAt)}
      </p>

      {action}
    </div>
  );
}

/** Secondary line under the status: retry timing, or how many tries were spent. */
function subline(delivery: WebhookDeliveryView): string | null {
  if (delivery.status === 'FAILED' && delivery.nextAttemptAt) {
    return `retry ${fromNow(delivery.nextAttemptAt)}`;
  }
  if (delivery.status === 'DEAD') {
    return `${delivery.attempts} attempt${delivery.attempts === 1 ? '' : 's'}`;
  }
  return null;
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** Compact relative time, e.g. "3m ago" (past) or "in 2m" (future). */
function fromNow(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diffMs) >= ms) {
      return rtf.format(Math.round(diffMs / ms), unit);
    }
  }
  return rtf.format(Math.round(diffMs / 1000), 'second');
}
