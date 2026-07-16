import { describe, expect, it } from 'vitest';
import { IntentStatus } from '../generated/prisma/client';
import {
  decideTransition,
  IntentEvent,
  TransitionConflictError,
} from './state-machine';

const ALL_STATUSES: IntentStatus[] = [
  'CREATED',
  'PENDING',
  'DETECTED',
  'CONFIRMED',
  'FINALIZED',
  'EXPIRED',
  'UNDERPAID',
  'LATE_PAYMENT',
];

/** Every event the machine knows, including both PAYMENT_FINALIZED payloads. */
const ALL_EVENTS: IntentEvent[] = [
  { type: 'WATCH_STARTED' },
  { type: 'QUOTE_EXPIRED' },
  { type: 'PAYMENT_DETECTED' },
  { type: 'PAYMENT_UNDERPAID' },
  { type: 'PAYMENT_CONFIRMED' },
  { type: 'PAYMENT_FINALIZED', overpaid: false },
  { type: 'PAYMENT_FINALIZED', overpaid: true },
  { type: 'LATE_PAYMENT_DETECTED' },
  { type: 'DUPLICATE_PAYMENT_DETECTED' },
];

/**
 * The full transition table from the PLAN.md diagram. Anything not listed
 * here must be rejected — the exhaustive sweep below checks every pair.
 */
const VALID: Record<string, { to: IntentStatus; flags?: string[] }> = {
  'CREATED + WATCH_STARTED': { to: 'PENDING' },
  'CREATED + QUOTE_EXPIRED': { to: 'EXPIRED' },
  'PENDING + PAYMENT_DETECTED': { to: 'DETECTED' },
  'PENDING + QUOTE_EXPIRED': { to: 'EXPIRED' },
  'DETECTED + PAYMENT_CONFIRMED': { to: 'CONFIRMED' },
  'DETECTED + PAYMENT_UNDERPAID': { to: 'UNDERPAID' },
  'CONFIRMED + PAYMENT_FINALIZED(exact)': { to: 'FINALIZED' },
  'CONFIRMED + PAYMENT_FINALIZED(overpaid)': {
    to: 'FINALIZED',
    flags: ['OVERPAID'],
  },
  'EXPIRED + LATE_PAYMENT_DETECTED': { to: 'LATE_PAYMENT' },
  'FINALIZED + DUPLICATE_PAYMENT_DETECTED': {
    to: 'FINALIZED',
    flags: ['DUPLICATE_PAYMENT'],
  },
};

function key(status: IntentStatus, event: IntentEvent): string {
  if (event.type === 'PAYMENT_FINALIZED') {
    return `${status} + PAYMENT_FINALIZED(${event.overpaid ? 'overpaid' : 'exact'})`;
  }
  return `${status} + ${event.type}`;
}

describe('decideTransition — exhaustive state × event sweep', () => {
  it.each(
    ALL_STATUSES.flatMap((status) =>
      ALL_EVENTS.map((event) => [key(status, event), status, event] as const),
    ),
  )('%s', (pairKey, status, event) => {
    const decision = decideTransition(status, event);
    const expected = VALID[pairKey];

    if (expected) {
      expect(decision).toEqual({
        ok: true,
        to: expected.to,
        addFlags: expected.flags ?? [],
      });
    } else {
      expect(decision.ok).toBe(false);
      if (!decision.ok) {
        // the rejection names the offending status so conflict logs are readable
        expect(decision.reason).toContain(status);
      }
    }
  });

  it('accepts exactly the pairs in the PLAN diagram — no accidental widening', () => {
    const accepted = ALL_STATUSES.flatMap((status) =>
      ALL_EVENTS.filter((event) => decideTransition(status, event).ok).map(
        (event) => key(status, event),
      ),
    );
    expect(accepted.sort()).toEqual(Object.keys(VALID).sort());
  });

  it('terminal states accept nothing at all', () => {
    for (const status of ['UNDERPAID', 'LATE_PAYMENT'] as const) {
      for (const event of ALL_EVENTS) {
        expect(decideTransition(status, event).ok).toBe(false);
      }
    }
  });

  it('expiry loses against a detected payment — the benign race (rule 11)', () => {
    expect(decideTransition('DETECTED', { type: 'QUOTE_EXPIRED' }).ok).toBe(
      false,
    );
  });
});

describe('TransitionConflictError', () => {
  it('is a 409 problem carrying the losing state and event', () => {
    const error = new TransitionConflictError(
      'FINALIZED',
      'WATCH_STARTED',
      'nope',
    );
    expect(error.getStatus()).toBe(409);
    expect(error.code).toBe('conflict');
    expect(error.from).toBe('FINALIZED');
    expect(error.event).toBe('WATCH_STARTED');
  });
});
