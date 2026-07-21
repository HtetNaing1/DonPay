import { cn } from '@/lib/utils';

export interface StatusFilterOption<T extends string> {
  value: T;
  label: string;
  count: number;
}

/** Segmented status filter with live counts. Presentational — the owner holds
 *  the selected value and decides how the counts are computed. */
export function LinkStatusFilter<T extends string>({
  value,
  options,
  onChange,
  ariaLabel = 'Filter links by status',
}: {
  value: T;
  options: readonly StatusFilterOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              active
                ? 'border-brand/50 bg-brand/10 text-brand-deep'
                : 'border-hairline text-ink-soft hover:border-ink-soft/50 hover:text-ink',
            )}
          >
            {option.label}
            <span
              className={cn(
                'font-mono text-[11px] tabular-nums',
                active ? 'text-brand-deep/70' : 'text-ink-soft/60',
              )}
            >
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
