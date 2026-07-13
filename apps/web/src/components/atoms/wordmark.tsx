import { cn } from '@/lib/utils';

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-display text-2xl tracking-tight', className)}>
      DonPay<span className="text-brand">.</span>
    </span>
  );
}
