'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  CheckoutIntent,
  IntentStatus,
  fiatMinorToMajor,
  tokenMinorToMajor,
} from '@donpay/shared';
import { CopyButton } from '@/components/atoms/copy-button';
import { QrCode } from '@/components/atoms/qr-code';
import { StatusDot } from '@/components/atoms/status-dot';
import { cn } from '@/lib/utils';

const HAPPY_PATH: IntentStatus[] = [
  'CREATED',
  'PENDING',
  'DETECTED',
  'CONFIRMED',
  'FINALIZED',
];

const POLL_MS = 30_000;

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
}

function explorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function tokenAmount(intent: CheckoutIntent): string {
  return `${tokenMinorToMajor(BigInt(intent.amountToken), intent.token)} ${intent.token}`;
}

/**
 * The live payment ticket — the real version of the one the homepage mocks.
 * Server-rendered with the initial intent; a socket (with a slow poll as
 * belt-and-braces) keeps it truthful while the chain watcher works.
 */
export function CheckoutPanel({ initial }: { initial: CheckoutIntent }) {
  const [intent, setIntent] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const seenTransitions = useRef(initial.transitions.length);

  // live updates: socket first, slow poll as the safety net
  useEffect(() => {
    const socket = io(`${apiBase()}/checkout`, { transports: ['websocket'] });
    // (re)joining also replays a snapshot, healing anything missed offline
    socket.on('connect', () => socket.emit('watch', { intentId: initial.id }));
    socket.on('intent', (next: CheckoutIntent) => setIntent(next));

    const poll = setInterval(() => {
      void fetch(`${apiBase()}/checkout/intents/${initial.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((next: CheckoutIntent | null) => next && setIntent(next))
        .catch(() => undefined);
    }, POLL_MS);

    return () => {
      socket.disconnect();
      clearInterval(poll);
    };
  }, [initial.id]);

  // countdown ticker, only while the quote can still expire
  const awaitingPayment = intent.status === 'CREATED' || intent.status === 'PENDING';
  useEffect(() => {
    if (!awaitingPayment) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [awaitingPayment]);

  const expiresAt = new Date(intent.quoteExpiresAt).getTime();
  const createdAt = new Date(intent.createdAt).getTime();
  const remainingMs = Math.max(0, expiresAt - now);
  const remainingRatio =
    expiresAt > createdAt ? remainingMs / (expiresAt - createdAt) : 0;
  const closing = remainingMs < 60_000;

  const settled = intent.status === 'FINALIZED';
  const chip = statusChip(intent);

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-xl border border-hairline bg-surface shadow-[0_24px_48px_-24px_rgba(20,32,27,0.25)]">
        {/* header — who is being paid, and where things stand */}
        <div className="flex items-center justify-between gap-3 border-b border-dashed border-hairline px-5 py-3.5">
          <span className="font-mono text-[11px] tracking-widest text-ink-soft uppercase">
            Payment request
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase',
              chip.className,
            )}
          >
            <StatusDot tone={chip.tone} pulse={chip.pulse} />
            {chip.label}
          </span>
        </div>

        {/* the ask */}
        <div className="px-5 pt-4 pb-4">
          <h1 className="font-display text-xl text-ink">
            Pay {intent.merchantName}
          </h1>
          {intent.note && (
            <p className="mt-0.5 text-sm text-ink-soft">{intent.note}</p>
          )}
          <p className="mt-3 font-mono text-3xl font-medium tracking-tight text-ink">
            {fiatMinorToMajor(intent.amountFiat, intent.fiatCurrency)}
            <span className="ml-1.5 text-base font-normal text-ink-soft">
              {intent.fiatCurrency}
            </span>
          </p>
          <p className="mt-1 font-mono text-[13px] text-ink-soft">
            = {tokenAmount(intent)}
            <span className="text-ink-soft/70"> · rate locked</span>
          </p>
        </div>

        <div className="border-t border-dashed border-hairline">
          {awaitingPayment && (
            <PayPrompt
              intent={intent}
              remainingMs={remainingMs}
              remainingRatio={remainingRatio}
              closing={closing}
            />
          )}
          {(intent.status === 'DETECTED' || intent.status === 'CONFIRMED') && (
            <ConfirmingPanel intent={intent} />
          )}
          {settled && <PaidPanel intent={intent} />}
          {intent.status === 'UNDERPAID' && <UnderpaidPanel intent={intent} />}
          {intent.status === 'EXPIRED' && <ExpiredPanel intent={intent} />}
          {intent.status === 'LATE_PAYMENT' && <LatePanel intent={intent} />}
        </div>

        {/* state rail — real timestamps, filled by the chain watcher */}
        <StateRail intent={intent} seenTransitions={seenTransitions} />
      </div>

      <p className="mt-4 text-center font-mono text-[11px] text-ink-soft/80">
        Powered by DonPay · non-custodial — funds go directly to{' '}
        {intent.merchantName}
      </p>
    </div>
  );
}

function statusChip(intent: CheckoutIntent): {
  label: string;
  tone: 'idle' | 'pending' | 'success' | 'error';
  pulse: boolean;
  className: string;
} {
  switch (intent.status) {
    case 'CREATED':
    case 'PENDING':
      return {
        label: 'awaiting payment',
        tone: 'pending',
        pulse: true,
        className: 'bg-pend/10 text-pend',
      };
    case 'DETECTED':
    case 'CONFIRMED':
      return {
        label: 'confirming',
        tone: 'pending',
        pulse: true,
        className: 'bg-pend/10 text-pend',
      };
    case 'FINALIZED':
      return {
        label: 'paid',
        tone: 'success',
        pulse: false,
        className: 'bg-brand/10 text-brand-deep',
      };
    case 'UNDERPAID':
      return {
        label: 'short paid',
        tone: 'error',
        pulse: false,
        className: 'bg-destructive/10 text-destructive',
      };
    case 'EXPIRED':
      return {
        label: 'expired',
        tone: 'idle',
        pulse: false,
        className: 'bg-ink/5 text-ink-soft',
      };
    case 'LATE_PAYMENT':
      return {
        label: 'late payment',
        tone: 'pending',
        pulse: false,
        className: 'bg-pend/10 text-pend',
      };
  }
}

/** QR, wallet deep link, pay-to details, and the draining quote countdown. */
function PayPrompt({
  intent,
  remainingMs,
  remainingRatio,
  closing,
}: {
  intent: CheckoutIntent;
  remainingMs: number;
  remainingRatio: number;
  closing: boolean;
}) {
  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000)
    .toString()
    .padStart(2, '0');

  return (
    <div className="px-5 py-5">
      <div className="flex justify-center">
        <QrCode value={intent.paymentUrl} displaySize={192} />
      </div>
      <a
        href={intent.paymentUrl}
        className="mt-4 flex w-full items-center justify-center rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Open in wallet
      </a>

      <dl className="mt-4 space-y-1 font-mono text-[12.5px]">
        <LedgerRow label="Send exactly" value={tokenAmount(intent)} copy={tokenMinorToMajor(BigInt(intent.amountToken), intent.token)} />
        <LedgerRow label="Pay to" value={shortAddress(intent.payoutAddress)} copy={intent.payoutAddress} />
        <LedgerRow label="Reference" value={shortAddress(intent.reference)} copy={intent.reference} />
      </dl>
      <p className="mt-2 text-[12px] leading-snug text-ink-soft">
        Scanning the code includes the reference automatically — it is how this
        payment is recognized.
      </p>

      {/* quote countdown: a hairline that drains with the lock */}
      <div className="mt-4" role="timer" aria-live="off">
        <div className="h-px w-full bg-hairline">
          <div
            className={cn(
              'h-px transition-[width] duration-1000 ease-linear',
              closing ? 'bg-destructive' : 'bg-pend',
            )}
            style={{ width: `${Math.max(0, Math.min(1, remainingRatio)) * 100}%` }}
          />
        </div>
        <p
          className={cn(
            'mt-1.5 font-mono text-[11.5px]',
            closing ? 'text-destructive' : 'text-ink-soft',
          )}
        >
          Rate locked for {minutes}:{seconds} — after that this quote expires
        </p>
      </div>
    </div>
  );
}

function LedgerRow({
  label,
  value,
  copy,
}: {
  label: string;
  value: string;
  copy: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="flex items-center gap-0.5 text-ink">
        {value}
        <CopyButton value={copy} label={`Copy ${label.toLowerCase()}`} className="-my-1.5 p-1.5" />
      </dd>
    </div>
  );
}

function ConfirmingPanel({ intent }: { intent: CheckoutIntent }) {
  const signature = intent.payments[0]?.txSignature;
  return (
    <div className="px-5 py-6 text-center">
      <p className="inline-flex items-center gap-2 font-mono text-sm text-ink">
        <StatusDot tone="pending" pulse />
        Payment found — confirming on Solana
      </p>
      <p className="mt-2 text-[12.5px] text-ink-soft">
        {intent.status === 'DETECTED'
          ? 'Your transaction reached the network. Finality usually takes a few seconds.'
          : 'Confirmed — waiting for finality.'}
      </p>
      {signature && <TxLink signature={signature} />}
    </div>
  );
}

function PaidPanel({ intent }: { intent: CheckoutIntent }) {
  const overpaid = intent.flags.includes('OVERPAID');
  const duplicate = intent.flags.includes('DUPLICATE_PAYMENT');
  const paid = intent.payments[0];
  const surplus =
    overpaid && paid
      ? tokenMinorToMajor(
          BigInt(paid.amountToken) - BigInt(intent.amountToken),
          intent.token,
        )
      : null;

  return (
    <div className="bg-brand/5 px-5 py-6 text-center">
      <span
        aria-hidden="true"
        className="mx-auto flex size-10 items-center justify-center rounded-full bg-brand text-xl text-brand-foreground"
      >
        ✓
      </span>
      <p className="mt-3 font-display text-lg text-ink">Paid</p>
      <p className="mt-0.5 font-mono text-[13px] text-ink-soft">
        {tokenAmount(intent)} · finalized on Solana
      </p>
      {paid && <TxLink signature={paid.txSignature} />}
      {surplus && (
        <p className="mt-3 rounded-md bg-pend/10 px-3 py-2 text-left text-[12px] leading-snug text-pend">
          This payment came to {surplus} {intent.token} more than quoted. The
          surplus stays with {intent.merchantName} — mention the reference if
          you need it back.
        </p>
      )}
      {duplicate && (
        <p className="mt-3 rounded-md bg-pend/10 px-3 py-2 text-left text-[12px] leading-snug text-pend">
          More than one payment was received for this request. Each one is
          recorded — contact {intent.merchantName} with the reference to
          settle the extra.
        </p>
      )}
      <p className="mt-3 text-[12px] text-ink-soft">You can close this page.</p>
    </div>
  );
}

function UnderpaidPanel({ intent }: { intent: CheckoutIntent }) {
  const received = intent.payments[0];
  return (
    <div className="bg-destructive/5 px-5 py-6">
      <p className="font-display text-lg text-ink">Payment came up short</p>
      <p className="mt-2 font-mono text-[12.5px] text-ink">
        Received{' '}
        {received
          ? tokenMinorToMajor(BigInt(received.amountToken), intent.token)
          : '0'}{' '}
        of {tokenAmount(intent)}
      </p>
      <p className="mt-2 text-[12.5px] leading-snug text-ink-soft">
        The transfer arrived but was under the quoted amount, so the order is
        not settled. Contact {intent.merchantName} with this reference to
        resolve it:
      </p>
      <p className="mt-2 flex items-center font-mono text-[12.5px] text-ink">
        {shortAddress(intent.reference)}
        <CopyButton value={intent.reference} label="Copy reference" className="-my-1.5 p-1.5" />
      </p>
      {received && <TxLink signature={received.txSignature} align="left" />}
    </div>
  );
}

function ExpiredPanel({ intent }: { intent: CheckoutIntent }) {
  return (
    <div className="px-5 py-6 text-center">
      <p className="font-display text-lg text-ink">This quote expired</p>
      <p className="mx-auto mt-2 max-w-[36ch] text-[12.5px] leading-snug text-ink-soft">
        No payment arrived while the rate was locked. Nothing was charged.
      </p>
      {intent.linkSlug ? (
        <a
          href={`/pay/${intent.linkSlug}`}
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Start a new checkout
        </a>
      ) : (
        <p className="mt-3 text-[12px] text-ink-soft">
          Ask {intent.merchantName} for a new payment request.
        </p>
      )}
    </div>
  );
}

function LatePanel({ intent }: { intent: CheckoutIntent }) {
  const paid = intent.payments[0];
  return (
    <div className="bg-pend/5 px-5 py-6">
      <p className="font-display text-lg text-ink">Payment arrived late</p>
      <p className="mt-2 text-[12.5px] leading-snug text-ink-soft">
        The transfer landed after the quote expired. It is recorded and{' '}
        {intent.merchantName} has been notified — they will settle it with
        you. Keep the reference:
      </p>
      <p className="mt-2 flex items-center font-mono text-[12.5px] text-ink">
        {shortAddress(intent.reference)}
        <CopyButton value={intent.reference} label="Copy reference" className="-my-1.5 p-1.5" />
      </p>
      {paid && <TxLink signature={paid.txSignature} align="left" />}
    </div>
  );
}

function TxLink({
  signature,
  align = 'center',
}: {
  signature: string;
  align?: 'center' | 'left';
}) {
  return (
    <p className={cn('mt-2 font-mono text-[12px]', align === 'center' && 'text-center')}>
      <a
        href={explorerUrl(signature)}
        target="_blank"
        rel="noreferrer"
        className="text-brand-deep underline decoration-brand-deep/40 underline-offset-2 hover:decoration-brand-deep"
      >
        tx {signature.slice(0, 8)}…{signature.slice(-6)} ↗
      </a>
    </p>
  );
}

/** Real transition timestamps; upcoming happy-path states sit dimmed below. */
function StateRail({
  intent,
  seenTransitions,
}: {
  intent: CheckoutIntent;
  seenTransitions: React.MutableRefObject<number>;
}) {
  const rows = useMemo(() => {
    const reached = [
      { status: 'CREATED' as IntentStatus, at: intent.createdAt },
      ...intent.transitions.filter(
        // flag-only FINALIZED→FINALIZED events would duplicate the row
        (t, i, all) => all.findIndex((x) => x.status === t.status) === i,
      ),
    ];
    const terminal = ['UNDERPAID', 'EXPIRED', 'LATE_PAYMENT', 'FINALIZED'].includes(
      intent.status,
    );
    const upcoming = terminal
      ? []
      : HAPPY_PATH.filter((s) => !reached.some((r) => r.status === s));
    return { reached, upcoming };
  }, [intent]);

  // rows beyond this count are new this render → they animate in
  const previouslySeen = seenTransitions.current;
  useEffect(() => {
    seenTransitions.current = rows.reached.length;
  }, [rows.reached.length, seenTransitions]);

  const lastIndex = rows.reached.length - 1;

  return (
    <ol
      className="border-t border-dashed border-hairline px-5 py-4"
      aria-label="Payment timeline"
    >
      {rows.reached.map((row, i) => {
        const isLast = i === lastIndex && rows.upcoming.length === 0;
        const isCurrent = i === lastIndex && rows.upcoming.length > 0;
        const good = row.status === 'FINALIZED';
        const bad = row.status === 'UNDERPAID';
        return (
          <li
            key={row.status}
            className={cn(
              'flex items-baseline gap-3 py-1 font-mono text-[12px]',
              i >= previouslySeen && 'ticket-row-in',
            )}
          >
            <StatusDot
              tone={good ? 'success' : bad ? 'error' : 'pending'}
              pulse={isCurrent}
              className="translate-y-px"
            />
            <span className={cn('w-28 shrink-0', isLast || isCurrent ? 'text-ink' : 'text-ink-soft')}>
              {row.status}
            </span>
            <span className="ml-auto text-ink-soft/70">
              {new Date(row.at).toLocaleTimeString([], { hour12: false })}
            </span>
          </li>
        );
      })}
      {rows.upcoming.map((status) => (
        <li
          key={status}
          className="flex items-baseline gap-3 py-1 font-mono text-[12px] opacity-30"
        >
          <StatusDot tone="idle" className="translate-y-px" />
          <span className="w-28 shrink-0 text-ink-soft">{status}</span>
        </li>
      ))}
    </ol>
  );
}
