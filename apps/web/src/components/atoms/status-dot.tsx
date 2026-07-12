import { cn } from '@/lib/utils';

type StatusTone = 'idle' | 'pending' | 'success' | 'error';

const toneClasses: Record<StatusTone, string> = {
  idle: 'bg-ink-soft/40',
  pending: 'bg-pend',
  success: 'bg-brand',
  error: 'bg-destructive',
};

export function StatusDot({
  tone,
  pulse = false,
  className,
}: {
  tone: StatusTone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)}>
      {pulse && (
        <span
          className={cn(
            'absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:hidden',
            toneClasses[tone],
          )}
        />
      )}
      <span className={cn('relative inline-flex size-2 rounded-full', toneClasses[tone])} />
    </span>
  );
}
