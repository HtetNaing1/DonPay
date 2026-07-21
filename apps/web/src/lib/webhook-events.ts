import type { WebhookDeliveryView, WebhookEvent } from '@donpay/shared';

/** Merchant-facing names for the events an endpoint can subscribe to. The raw
 *  `intent.*` id stays visible in the UI — developers match on it in code. */
export const WEBHOOK_EVENT_LABEL: Record<WebhookEvent, string> = {
  'intent.pending': 'Awaiting payment',
  'intent.detected': 'Payment detected',
  'intent.confirmed': 'Payment confirmed',
  'intent.finalized': 'Payment settled',
  'intent.expired': 'Checkout expired',
  'intent.underpaid': 'Underpaid',
  'intent.late_payment': 'Late payment',
  'intent.duplicate_payment': 'Duplicate payment',
};

/** One-line description shown next to each event when choosing a subscription. */
export const WEBHOOK_EVENT_HINT: Record<WebhookEvent, string> = {
  'intent.pending': 'A customer opened checkout and a payment is expected.',
  'intent.detected': 'A matching transfer appeared on-chain, not yet confirmed.',
  'intent.confirmed': 'The transfer reached its required confirmations.',
  'intent.finalized': 'Paid in full and settled — safe to fulfill the order.',
  'intent.expired': 'Checkout expired before any payment arrived.',
  'intent.underpaid': 'The customer paid less than the amount due.',
  'intent.late_payment': 'A payment landed after checkout had expired.',
  'intent.duplicate_payment': 'A second payment hit a one-time link.',
};

type DeliveryStatus = WebhookDeliveryView['status'];

/** Maps the stored delivery status to a StatusDot tone and merchant-facing
 *  label. FAILED still has retries left; DEAD has exhausted them. */
export const DELIVERY_STATUS = {
  PENDING: { tone: 'pending', label: 'Queued' },
  DELIVERED: { tone: 'success', label: 'Delivered' },
  FAILED: { tone: 'pending', label: 'Retrying' },
  DEAD: { tone: 'error', label: 'Failed' },
} as const satisfies Record<
  DeliveryStatus,
  { tone: 'idle' | 'pending' | 'success' | 'error'; label: string }
>;
