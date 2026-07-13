'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const STATES = ['CREATED', 'PENDING', 'DETECTED', 'CONFIRMED', 'FINALIZED'] as const;
const STEP_MS = 1200;
const HOLD_MS = 4200;
const ENTRANCE_MS = 1000; // let the rise-in entrance settle before stepping

/**
 * The payment happy path as a live rail: states light up one by one, the
 * finalized state settles in mint, holds, and the cycle restarts — the same
 * choreography as the homepage IntentTicket. Sits on the inverting pine/
 * porcelain auth panel, so it uses the theme-constant mint/evergreen accents.
 */
export function PaymentPathRail() {
  // CREATED is lit from the first paint; the rest follow on a timer
  const [reachedCount, setReachedCount] = useState(1);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReachedCount(STATES.length); // static, fully settled rail
      return;
    }
    setAnimate(true);
    let count = 1;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      count = count >= STATES.length ? 1 : count + 1;
      setReachedCount(count);
      timer = setTimeout(tick, count >= STATES.length ? HOLD_MS : STEP_MS);
    };
    timer = setTimeout(tick, ENTRANCE_MS + STEP_MS);
    return () => clearTimeout(timer);
  }, []);

  const settled = reachedCount >= STATES.length;

  return (
    <ol className="font-mono text-[13px]" aria-label="Payment intent happy path">
      {STATES.map((state, i) => {
        const isLast = i === STATES.length - 1;
        const reached = i < reachedCount;
        const isCurrent = animate && i === reachedCount - 1 && !settled && i > 0;
        const traversed = i < reachedCount - 1; // connector below this row was crossed
        return (
          <li
            key={state}
            className="rise-in flex items-stretch gap-5"
            style={{ '--rise-order': i + 1 } as React.CSSProperties}
          >
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'size-2.5 rounded-full transition-colors duration-300',
                  isLast && reached
                    ? 'bg-mint dark:bg-evergreen'
                    : reached
                      ? 'bg-porcelain/70 dark:bg-pine/70'
                      : 'border border-porcelain/40 dark:border-pine/40',
                  isCurrent && 'animate-pulse',
                )}
                aria-hidden="true"
              />
              {!isLast && (
                <span
                  className={cn(
                    'w-px flex-1 transition-colors duration-300',
                    traversed ? 'bg-porcelain/50 dark:bg-pine/50' : 'bg-porcelain/20 dark:bg-pine/25',
                  )}
                  aria-hidden="true"
                />
              )}
            </div>
            <span
              className={cn(
                'transition-colors duration-300',
                isLast ? 'pb-0' : 'pb-7',
                isLast && reached
                  ? 'text-mint dark:text-evergreen'
                  : reached
                    ? 'text-porcelain dark:text-pine'
                    : 'text-porcelain/45 dark:text-pine/45',
              )}
            >
              {state}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
