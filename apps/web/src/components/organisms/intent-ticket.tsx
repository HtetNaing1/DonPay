'use client';

import { useEffect, useState } from 'react';
import { StatusDot } from '@/components/atoms/status-dot';
import { cn } from '@/lib/utils';

const STEPS = [
  { status: 'CREATED', at: '14:02:09.114', detail: 'quote locked' },
  { status: 'PENDING', at: '14:02:09.301', detail: 'watching devnet' },
  { status: 'DETECTED', at: '14:03:41.870', detail: 'tx 5Uw…kQ2e' },
  { status: 'CONFIRMED', at: '14:03:54.026', detail: 'confirmed' },
  { status: 'FINALIZED', at: '14:04:12.489', detail: 'finalized' },
] as const;

const STEP_MS = 1400;
const HOLD_MS = 4200;

/** Deterministic pseudo-QR, decorative only */
function QrGlyph() {
  const size = 21;
  const cells: boolean[] = [];
  let seed = 42;
  for (let i = 0; i < size * size; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    cells.push(seed % 100 < 46);
  }
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={7} height={7} fill="none" stroke="currentColor" strokeWidth={1} />
      <rect x={x + 2} y={y + 2} width={3} height={3} fill="currentColor" />
    </g>
  );
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="size-24 text-pine" aria-hidden="true">
      {cells.map((on, i) => {
        const x = i % size;
        const y = Math.floor(i / size);
        const inFinder = (x < 8 && y < 8) || (x > size - 9 && y < 8) || (x < 8 && y > size - 9);
        return on && !inFinder ? (
          <rect key={i} x={x} y={y} width={1} height={1} fill="currentColor" />
        ) : null;
      })}
      {finder(0.5, 0.5)}
      {finder(size - 7.5, 0.5)}
      {finder(0.5, size - 7.5)}
    </svg>
  );
}

export function IntentTicket() {
  const [step, setStep] = useState(0);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStep(STEPS.length); // static, fully settled ticket
      return;
    }
    setAnimate(true);
    let current = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      current = current > STEPS.length ? 0 : current + 1;
      setStep(current);
      timer = setTimeout(tick, current >= STEPS.length ? HOLD_MS : STEP_MS);
    };
    timer = setTimeout(tick, STEP_MS);
    return () => clearTimeout(timer);
  }, []);

  const settled = step >= STEPS.length;

  return (
    <div className="w-full max-w-sm rounded-xl border border-hairline bg-surface shadow-[0_24px_48px_-24px_rgba(20,32,27,0.25)]">
      {/* header */}
      <div className="flex items-center justify-between border-b border-dashed border-hairline px-5 py-3.5">
        <span className="font-mono text-[11px] tracking-widest text-ink-soft uppercase">
          DonPay · payment intent
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase',
            settled ? 'bg-brand/10 text-brand-deep' : 'bg-pend/10 text-pend',
          )}
        >
          <StatusDot tone={settled ? 'success' : 'pending'} pulse={!settled} />
          {settled ? 'finalized' : 'live'}
        </span>
      </div>

      {/* order summary */}
      <dl className="space-y-2 px-5 py-4 font-mono text-[12.5px] text-ink">
        {[
          ['Merchant', 'Demo Jewellery Store'],
          ['Item', 'Gold pendant'],
          ['Amount', '¥18,000'],
          ['Quote', '114.503816 USDC'],
          ['Reference', '9vKtWq3xR7e2…AzG'],
          ['Pay to', '7Qm3ceXb81vN…jf9P'],
        ].map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <dt className="text-ink-soft">{label}</dt>
            <dd className="text-right">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex justify-center border-y border-dashed border-hairline py-4">
        {/* constant light plate so the QR stays dark-on-light in dark mode */}
        <div className="rounded-md bg-porcelain p-2">
          <QrGlyph />
        </div>
      </div>

      {/* state rail */}
      <ol className="px-5 py-4" aria-label="Payment intent state timeline">
        {STEPS.map((s, i) => {
          const reached = i < Math.max(step, 1) || (i === 0 && step === 0);
          const isCurrent = i === Math.min(step, STEPS.length) - 1 || (step === 0 && i === 0);
          return (
            <li
              key={s.status}
              className={cn(
                'flex items-baseline gap-3 py-1 font-mono text-[12px]',
                !reached && 'opacity-30',
                reached && animate && 'ticket-row-in',
              )}
            >
              <StatusDot
                tone={reached ? (i === STEPS.length - 1 ? 'success' : 'pending') : 'idle'}
                pulse={isCurrent && !settled && reached}
                className="translate-y-px"
              />
              <span className={cn('w-24 shrink-0', reached ? 'text-ink' : 'text-ink-soft')}>
                {s.status}
              </span>
              <span className="hidden min-w-0 flex-1 truncate text-ink-soft sm:inline-block">
                {reached ? s.detail : ''}
              </span>
              <span className="ml-auto text-ink-soft/70">{reached ? s.at : ''}</span>
            </li>
          );
        })}
      </ol>

      {/* webhook receipt line */}
      <div
        className={cn(
          'border-t border-dashed border-hairline px-5 py-3.5 font-mono text-[11.5px] transition-opacity duration-500',
          settled ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden={!settled}
      >
        <span className="text-brand-deep">→ webhook intent.finalized</span>{' '}
        <span className="text-ink-soft">delivered · 200 OK · sha256=9f2c41…d8a0</span>
      </div>
    </div>
  );
}
