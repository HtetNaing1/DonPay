import { IntentFlag } from '@donpay/shared';
import { ERROR_CODES } from '../common/problem/error-codes';
import { ProblemException } from '../common/problem/problem.exception';
import { IntentStatus } from '../generated/prisma/client';

/**
 * The PaymentIntent state machine (PLAN.md — "the heart"):
 *
 *   CREATED ──► PENDING ──► DETECTED ──► CONFIRMED ──► FINALIZED
 *      │           │            │
 *      │           ▼            ▼
 *      └──────► EXPIRED     UNDERPAID (terminal)
 *                  │
 *                  ▼
 *           LATE_PAYMENT (terminal, flagged for merchant action)
 *
 * OVERPAID and DUPLICATE_PAYMENT are flags, not states: the funds are the
 * merchant's either way, so the intent still finalizes — the surplus or the
 * second payment is recorded, never silently swallowed (rule 11, FR-12).
 *
 * `decideTransition` is the pure decision function — no I/O, exhaustively
 * unit-tested over every state × event pair. Applying a decision is
 * `PaymentIntentService.transition()`, the only status writer (rule 2).
 */
export type IntentEvent =
  /** Checkout opened and the chain watcher enqueued. */
  | { type: 'WATCH_STARTED' }
  /** Quote lock ran out before any payment was seen. */
  | { type: 'QUOTE_EXPIRED' }
  /** A transaction carrying the reference appeared on chain. */
  | { type: 'PAYMENT_DETECTED' }
  /** The detected payment verified below the quoted amount. */
  | { type: 'PAYMENT_UNDERPAID' }
  /** Commitment level reached `confirmed`. */
  | { type: 'PAYMENT_CONFIRMED' }
  /** Commitment level reached `finalized`; `overpaid` per amount verification. */
  | { type: 'PAYMENT_FINALIZED'; overpaid: boolean }
  /** The 24h tail watch found a payment after expiry. */
  | { type: 'LATE_PAYMENT_DETECTED' }
  /** A second payment landed on an already-finalized intent (one-time link race). */
  | { type: 'DUPLICATE_PAYMENT_DETECTED' };

export type IntentEventType = IntentEvent['type'];

export type TransitionDecision =
  | { ok: true; to: IntentStatus; addFlags: IntentFlag[] }
  | { ok: false; reason: string };

export function decideTransition(
  status: IntentStatus,
  event: IntentEvent,
): TransitionDecision {
  switch (event.type) {
    case 'WATCH_STARTED':
      return move(status, ['CREATED'], 'PENDING');
    case 'QUOTE_EXPIRED':
      // Once a payment is DETECTED, expiry no longer applies — the racing
      // expiry job loses here and treats the conflict as a no-op.
      return move(status, ['CREATED', 'PENDING'], 'EXPIRED');
    case 'PAYMENT_DETECTED':
      return move(status, ['PENDING'], 'DETECTED');
    case 'PAYMENT_UNDERPAID':
      return move(status, ['DETECTED'], 'UNDERPAID');
    case 'PAYMENT_CONFIRMED':
      return move(status, ['DETECTED'], 'CONFIRMED');
    case 'PAYMENT_FINALIZED':
      return move(
        status,
        ['CONFIRMED'],
        'FINALIZED',
        event.overpaid ? ['OVERPAID'] : [],
      );
    case 'LATE_PAYMENT_DETECTED':
      return move(status, ['EXPIRED'], 'LATE_PAYMENT');
    case 'DUPLICATE_PAYMENT_DETECTED':
      // Flag-only transition: status stays FINALIZED, the audit row still
      // records the event so both parties can see the duplicate (FR-12).
      return move(status, ['FINALIZED'], 'FINALIZED', ['DUPLICATE_PAYMENT']);
  }
}

function move(
  current: IntentStatus,
  allowedFrom: IntentStatus[],
  to: IntentStatus,
  addFlags: IntentFlag[] = [],
): TransitionDecision {
  if (!allowedFrom.includes(current)) {
    return {
      ok: false,
      reason: `Cannot apply this event in status ${current} (allowed: ${allowedFrom.join(', ')})`,
    };
  }
  return { ok: true, to, addFlags };
}

/**
 * A transition rejected by the decision function. Distinct class so internal
 * callers (watcher, expiry jobs) can recognize a benign lost race — e.g. the
 * expiry job firing after detection — and drop the event instead of retrying.
 */
export class TransitionConflictError extends ProblemException {
  constructor(
    readonly from: IntentStatus,
    readonly event: IntentEventType,
    reason: string,
  ) {
    super(409, ERROR_CODES.CONFLICT, reason);
  }
}
