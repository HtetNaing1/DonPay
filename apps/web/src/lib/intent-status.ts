import type { IntentFlag, IntentStatus } from '@donpay/shared';

type Tone = 'idle' | 'pending' | 'success' | 'error';

interface StatusMeta {
  /** Merchant-facing name for the state. */
  label: string;
  tone: Tone;
  /** Pulse the status dot while the state is still in motion. */
  pulse: boolean;
  /** Pill background + text classes. */
  pill: string;
}

/** One place for how every intent state reads and colours across the dashboard. */
export const INTENT_STATUS_META: Record<IntentStatus, StatusMeta> = {
  CREATED: { label: 'Created', tone: 'idle', pulse: false, pill: 'bg-ink/5 text-ink-soft' },
  PENDING: { label: 'Awaiting payment', tone: 'pending', pulse: true, pill: 'bg-pend/10 text-pend' },
  DETECTED: { label: 'Detected', tone: 'pending', pulse: true, pill: 'bg-pend/10 text-pend' },
  CONFIRMED: { label: 'Confirming', tone: 'pending', pulse: true, pill: 'bg-pend/10 text-pend' },
  FINALIZED: { label: 'Paid', tone: 'success', pulse: false, pill: 'bg-brand/10 text-brand-deep' },
  EXPIRED: { label: 'Expired', tone: 'idle', pulse: false, pill: 'bg-ink/5 text-ink-soft' },
  UNDERPAID: {
    label: 'Underpaid',
    tone: 'error',
    pulse: false,
    pill: 'bg-destructive/10 text-destructive',
  },
  LATE_PAYMENT: { label: 'Late payment', tone: 'pending', pulse: false, pill: 'bg-pend/10 text-pend' },
};

export const INTENT_FLAG_LABEL: Record<IntentFlag, string> = {
  OVERPAID: 'Overpaid',
  DUPLICATE_PAYMENT: 'Duplicate payment',
};

/** Devnet explorer links — cluster comes from the payment's network (rule 10). */
export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function explorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

/** Middle-truncate a hash or address for display, keeping both ends. */
export function shortHash(value: string, lead = 4, tail = 4): string {
  return value.length <= lead + tail + 1 ? value : `${value.slice(0, lead)}…${value.slice(-tail)}`;
}
