import type { IntentStatus } from '@donpay/shared';
import { StatusDot } from '@/components/atoms/status-dot';
import { INTENT_STATUS_META } from '@/lib/intent-status';
import { cn } from '@/lib/utils';

/** Pill showing an intent's state — the same reading everywhere it appears. */
export function IntentStatusBadge({
  status,
  className,
}: {
  status: IntentStatus;
  className?: string;
}) {
  const meta = INTENT_STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase',
        meta.pill,
        className,
      )}
    >
      <StatusDot tone={meta.tone} pulse={meta.pulse} />
      {meta.label}
    </span>
  );
}
