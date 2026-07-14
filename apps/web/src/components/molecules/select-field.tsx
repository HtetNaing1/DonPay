'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePopoverDismiss } from '@/lib/use-popover-dismiss';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Secondary text shown right-aligned in the list ("US dollar"). */
  hint?: string;
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  hint?: string;
  error?: string;
  className?: string;
}

/**
 * Site-styled replacement for a native <select>: labeled trigger + listbox
 * with roving focus (arrows/Home/End/Enter, Escape restores the trigger).
 * Controlled — pair with react-hook-form's Controller.
 */
export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  className,
}: SelectFieldProps<T>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  usePopoverDismiss(open, rootRef, () => setOpen(false));

  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (open) optionRefs.current[active]?.focus();
  }, [open, active]);

  const openList = () => {
    const selectedIndex = options.findIndex((option) => option.value === value);
    setActive(Math.max(selectedIndex, 0));
    setOpen(true);
  };

  const choose = (option: SelectOption<T>) => {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onListKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowDown: Math.min(active + 1, options.length - 1),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: options.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className={cn('relative', className)} ref={rootRef}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-invalid={error ? true : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp'].includes(event.key) && !open) {
            event.preventDefault();
            openList();
          }
        }}
        className={cn(
          'mt-1.5 flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-md border bg-surface px-3.5 text-[15px] text-ink transition-colors duration-200',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
          error ? 'border-destructive' : 'border-hairline hover:border-ink-soft/50',
          open && 'border-ink-soft/50',
        )}
      >
        <span>{selected?.label}</span>
        <ChevronDown
          className={cn(
            'size-4 text-ink-soft transition-transform duration-200',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          aria-label={label}
          onKeyDown={onListKeyDown}
          className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-md border border-hairline bg-surface py-1 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 ease-out motion-reduce:animate-none"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={index === active ? 0 : -1}
                onClick={() => choose(option)}
                onFocus={() => setActive(index)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 px-3.5 py-2 text-left text-sm outline-none',
                  isSelected ? 'text-brand-deep' : 'text-ink',
                  index === active && 'bg-brand/5',
                )}
              >
                <Check
                  className={cn('size-3.5 shrink-0', !isSelected && 'invisible')}
                  aria-hidden="true"
                />
                <span className="font-medium">{option.label}</span>
                {option.hint && (
                  <span className="ml-auto text-[13px] text-ink-soft">{option.hint}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-1.5 text-[13px] text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-ink-soft">{hint}</p>
      ) : null}
    </div>
  );
}
