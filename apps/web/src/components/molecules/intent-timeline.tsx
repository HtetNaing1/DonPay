import type { IntentTransitionView } from '@donpay/shared';
import { StatusDot } from '@/components/atoms/status-dot';
import { INTENT_STATUS_META } from '@/lib/intent-status';
import { cn } from '@/lib/utils';

interface TimelineRow {
  status: IntentTransitionView['toStatus'];
  event: string;
  at: string;
}

/**
 * The intent's audit trail as a vertical rail — every real transition the
 * state machine wrote, in order, with the event that drove it. The order
 * carries meaning (it is a lifecycle), so the rail is the right device.
 */
export function IntentTimeline({
  transitions,
  createdAt,
}: {
  transitions: IntentTransitionView[];
  createdAt: string;
}) {
  const rows: TimelineRow[] = [
    { status: 'CREATED', event: 'INTENT_CREATED', at: createdAt },
    ...transitions.map((t) => ({ status: t.toStatus, event: t.event, at: t.at })),
  ];

  return (
    <ol aria-label="Payment timeline">
      {rows.map((row, i) => {
        const last = i === rows.length - 1;
        const meta = INTENT_STATUS_META[row.status];
        return (
          <li key={`${row.event}-${row.at}`} className="flex gap-4">
            <div className="flex flex-col items-center pt-1.5">
              <StatusDot tone={meta.tone} pulse={last && meta.pulse} />
              {!last && <span className="mt-1 w-px flex-1 bg-hairline" aria-hidden="true" />}
            </div>
            <div className={cn('pb-6', last && 'pb-0')}>
              <p className={cn('text-sm font-medium', last ? 'text-ink' : 'text-ink-soft')}>
                {meta.label}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-ink-soft/80">
                {row.event}
                <span className="text-ink-soft/50"> · </span>
                {new Date(row.at).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false,
                })}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
