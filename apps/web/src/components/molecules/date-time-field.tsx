'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePopoverDismiss } from '@/lib/use-popover-dismiss';

interface DateTimeFieldProps {
  label: string;
  /** `datetime-local` format ("2026-08-01T23:59") or "" when unset. */
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  placeholder?: string;
  className?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));

/** New selections default to end-of-day — natural for expiries. */
const DEFAULT_TIME = { hh: '23', mm: '59' };

function parseValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, hh, mm] = match;
  return { date: new Date(Number(y), Number(mo) - 1, Number(d)), hh, mm };
}

function composeValue(date: Date, hh: string, mm: string) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${hh}:${mm}`;
}

/**
 * Site-styled date+time picker (replaces the native datetime-local control):
 * a mono ledger-grid calendar with hour/minute rails for exact-time picks.
 * Past days are not selectable. Controlled — pair with react-hook-form's
 * Controller.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  hint,
  error,
  placeholder = 'No expiry',
  className,
}: DateTimeFieldProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  // Time chosen before any date is picked — applied on the first day pick.
  const [pendingTime, setPendingTime] = useState<{ hh: string; mm: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const parsed = parseValue(value);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [viewMonth, setViewMonth] = useState(
    () => new Date((parsed?.date ?? today).getFullYear(), (parsed?.date ?? today).getMonth(), 1),
  );

  const close = () => {
    setOpen(false);
    setPendingTime(null);
  };
  usePopoverDismiss(open, rootRef, close);

  const time = pendingTime ?? (parsed ? { hh: parsed.hh, mm: parsed.mm } : DEFAULT_TIME);

  const openPanel = () => {
    const anchor = parsed?.date ?? today;
    setViewMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    setOpen(true);
  };

  // "No expiry in the past": days before today are disabled in the grid;
  // when the chosen day is today, rail values before this minute disable too,
  // and picks clamp forward to now rather than landing in the past.
  const nowHH = today.getHours();
  const nowMM = today.getMinutes();
  const isTodaySelected = parsed?.date.getTime() === startOfToday.getTime();

  const pickDay = (day: Date) => {
    let { hh, mm } = time;
    if (day.getTime() === startOfToday.getTime()) {
      if (Number(hh) * 60 + Number(mm) < nowHH * 60 + nowMM) {
        hh = pad(nowHH);
        mm = pad(nowMM);
      }
    }
    setPendingTime(null);
    onChange(composeValue(day, hh, mm));
  };

  const pickTime = (part: 'hh' | 'mm', next: string) => {
    const nextTime = { ...time, [part]: next };
    if (isTodaySelected && Number(nextTime.hh) === nowHH && Number(nextTime.mm) < nowMM) {
      nextTime.mm = pad(nowMM);
    }
    if (parsed) {
      setPendingTime(null);
      onChange(composeValue(parsed.date, nextTime.hh, nextTime.mm));
    } else {
      setPendingTime(nextTime);
    }
  };

  const hourDisabled = (hh: string) => isTodaySelected && Number(hh) < nowHH;
  const minuteDisabled = (mm: string) =>
    isTodaySelected &&
    (Number(time.hh) < nowHH ||
      (Number(time.hh) === nowHH && Number(mm) < nowMM));

  // Leading blanks so day 1 lands under its weekday.
  const firstWeekday = viewMonth.getDay();
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1),
    ),
  ];

  const display = parsed
    ? `${MONTHS[parsed.date.getMonth()].slice(0, 3)} ${parsed.date.getDate()}, ${parsed.date.getFullYear()} · ${parsed.hh}:${parsed.mm}`
    : null;

  return (
    <div className={cn('relative', className)} ref={rootRef}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative mt-1.5">
        <button
          id={id}
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-invalid={error ? true : undefined}
          onClick={() => (open ? close() : openPanel())}
          className={cn(
            'flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-md border bg-surface px-3.5 text-[15px] transition-colors duration-200',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
            error ? 'border-destructive' : 'border-hairline hover:border-ink-soft/50',
            open && 'border-ink-soft/50',
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-ink-soft" aria-hidden="true" />
          {display ? (
            <span className="font-mono text-[14px] text-ink">{display}</span>
          ) : (
            <span className="text-ink-soft/50">{placeholder}</span>
          )}
        </button>
        {parsed && (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => onChange('')}
            className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-md p-1.5 text-ink-soft transition-colors duration-200 hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-label={`Choose ${label.toLowerCase()}`}
          className="absolute inset-x-0 top-full z-30 mt-1.5 rounded-md border border-hairline bg-surface p-3 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 ease-out motion-reduce:animate-none sm:inset-x-auto sm:left-0 sm:w-[22.5rem]"
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() =>
                    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
                  }
                  className="cursor-pointer rounded-md p-1.5 text-ink-soft transition-colors duration-200 hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </button>
                <p className="text-sm font-medium text-ink" aria-live="polite">
                  {MONTHS[viewMonth.getMonth()]}{' '}
                  <span className="font-mono text-[13px] text-ink-soft">
                    {viewMonth.getFullYear()}
                  </span>
                </p>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() =>
                    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))
                  }
                  className="cursor-pointer rounded-md p-1.5 text-ink-soft transition-colors duration-200 hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </div>

              <div className="mt-2 grid grid-cols-7 gap-y-0.5">
                {WEEKDAYS.map((day) => (
                  <span
                    key={day}
                    className="py-1 text-center font-mono text-[10px] tracking-widest text-ink-soft/60 uppercase"
                  >
                    {day}
                  </span>
                ))}
                {cells.map((day, index) => {
                  if (!day) return <span key={`blank-${index}`} />;
                  const isPast = day < startOfToday;
                  const isSelected =
                    parsed !== null && day.getTime() === parsed.date.getTime();
                  const isToday = day.getTime() === startOfToday.getTime();
                  return (
                    <button
                      key={day.getTime()}
                      type="button"
                      disabled={isPast}
                      aria-pressed={isSelected}
                      onClick={() => pickDay(day)}
                      className={cn(
                        'relative mx-auto flex size-8 cursor-pointer items-center justify-center rounded-md font-mono text-[13px] transition-colors duration-200',
                        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
                        isSelected
                          ? 'bg-brand font-medium text-brand-foreground'
                          : 'text-ink hover:bg-brand/10',
                        isPast && 'cursor-default text-ink-soft/30 hover:bg-transparent',
                        isToday &&
                          !isSelected &&
                          'after:absolute after:bottom-1 after:size-1 after:rounded-full after:bg-brand',
                      )}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <TimeRail
                label="HH"
                values={HOURS}
                selected={time.hh}
                onSelect={(next) => pickTime('hh', next)}
                isDisabled={hourDisabled}
              />
              <TimeRail
                label="MM"
                values={MINUTES}
                selected={time.mm}
                onSelect={(next) => pickTime('mm', next)}
                isDisabled={minuteDisabled}
              />
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2.5">
            <p className="font-mono text-[13px] text-ink-soft">
              {parsed ? display : `— · ${time.hh}:${time.mm}`}
            </p>
            <button
              type="button"
              onClick={close}
              className="cursor-pointer rounded-md px-2.5 py-1.5 text-[13px] font-medium text-brand-deep transition-colors duration-200 hover:bg-brand/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Done
            </button>
          </div>
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

/** Scrollable unit column (hours or minutes); opens centered on the selection. */
function TimeRail({
  label,
  values,
  selected,
  onSelect,
  isDisabled,
}: {
  label: string;
  values: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
  isDisabled?: (value: string) => boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Center the selection once, when the panel opens (this component mounts).
  // Never on later selections — the list jumping under a just-tapped value
  // reads as a glitch.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (list && el) {
      // manual math instead of scrollIntoView so the page itself never jumps;
      // covers both the vertical (desktop) and horizontal (mobile) layouts
      list.scrollTop = el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2;
      list.scrollLeft = el.offsetLeft - list.clientWidth / 2 + el.clientWidth / 2;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-w-0 items-center gap-2 border-t border-hairline pt-2 sm:w-12 sm:shrink-0 sm:flex-col sm:items-stretch sm:gap-0 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-2">
      <span className="shrink-0 font-mono text-[10px] tracking-widest text-ink-soft/60 uppercase sm:pb-1 sm:text-center">
        {label}
      </span>
      <div
        ref={listRef}
        className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:max-h-56 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto"
      >
        {values.map((value) => {
          const disabled = isDisabled?.(value) ?? false;
          return (
            <button
              key={value}
              type="button"
              disabled={disabled}
              aria-pressed={value === selected}
              onClick={() => onSelect(value)}
              className={cn(
                'shrink-0 cursor-pointer rounded-md px-2.5 py-1 text-center font-mono text-[13px] transition-colors duration-200 sm:px-0',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
                value === selected
                  ? 'bg-brand font-medium text-brand-foreground'
                  : 'text-ink hover:bg-brand/10',
                disabled && 'cursor-default text-ink-soft/30 hover:bg-transparent',
              )}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}
