import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeChainAdapter } from '../src/chain/testing/fake-chain.adapter';
import { IdempotencyService } from '../src/common/idempotency.service';
import { Env } from '../src/config/env';
import { PaymentIntent } from '../src/generated/prisma/client';
import { PaymentIntentService } from '../src/intents/payment-intent.service';
import {
  IntentEvent,
  TransitionConflictError,
} from '../src/intents/state-machine';
import { effectiveLinkStatus } from '../src/links/link-status';
import { PrismaService } from '../src/prisma/prisma.service';
import { IntentEventsService } from '../src/queues/intent-events.service';
import { WatchQueueService } from '../src/queues/watch-queue.service';
import { QuoteService } from '../src/rates/quote.service';
import { WebhookOutboxService } from '../src/webhooks/webhook-outbox.service';

/**
 * The two race guarantees, proven against REAL Postgres — mocks cannot
 * exercise `SELECT ... FOR UPDATE`, and these tests exist precisely to show
 * the locking works (NFR-1, FR-12). Needs DATABASE_URL in apps/api/.env.
 */

const config = {
  get: (key: string) =>
    key === 'DATABASE_URL'
      ? process.env.DATABASE_URL
      : 'http://localhost:3000',
} as unknown as ConfigService<Env, true>;

const prisma = new PrismaService(config);
const service = new PaymentIntentService(
  prisma,
  null as unknown as QuoteService, // transition() never quotes
  null as unknown as IdempotencyService, // nor replays
  new FakeChainAdapter(), // reference generation (unused here)
  { now: () => new Date() },
  config,
  { startWatch: async () => undefined } as unknown as WatchQueueService,
  new FakeChainAdapter(), // payment URLs in the returned views
  { publish: async () => undefined } as unknown as IntentEventsService,
  // real outbox: the race merchant has no endpoints, so no rows are written,
  // but the query runs inside the contended transaction like production
  new WebhookOutboxService({ now: () => new Date() }),
);

let merchantId: string;

beforeAll(async () => {
  const merchant = await prisma.merchant.create({
    data: {
      email: `race-${randomUUID()}@test.dev`,
      passwordHash: 'not-a-login',
      name: 'Race Guarantees',
    },
  });
  merchantId = merchant.id;
});

afterAll(async () => {
  await prisma.merchant.delete({ where: { id: merchantId } });
  await prisma.$disconnect();
});

function seedIntent(
  overrides: Partial<Pick<PaymentIntent, 'status' | 'linkId'>> = {},
) {
  return prisma.paymentIntent.create({
    data: {
      merchantId,
      linkId: overrides.linkId ?? null,
      reference: `race-ref-${randomUUID()}`,
      fiatCurrency: 'USD',
      amountFiat: 100,
      token: 'SOL',
      amountToken: 1_000_000n,
      rateLocked: '1',
      rateSource: 'race-test',
      quoteExpiresAt: new Date(Date.now() + 600_000),
      payoutAddress: 'So11111111111111111111111111111111111111112',
      status: overrides.status ?? 'CREATED',
    },
  });
}

describe('concurrency: one intent, conflicting events (NFR-1)', () => {
  it(
    '10 parallel conflicting events → exactly one winner, one audit row, zero double-writes',
    async () => {
      const intent = await seedIntent({ status: 'PENDING' });
      // detection and expiry fight over the same row — only one path may win
      const events: IntentEvent[] = Array.from({ length: 10 }, (_, i) =>
        i % 2 === 0 ? { type: 'QUOTE_EXPIRED' } : { type: 'PAYMENT_DETECTED' },
      );

      const results = await Promise.allSettled(
        events.map((event) => service.transition(intent.id, event)),
      );

      const winners = results.filter((r) => r.status === 'fulfilled');
      const conflicts = results.filter(
        (r) =>
          r.status === 'rejected' &&
          r.reason instanceof TransitionConflictError,
      );
      expect(winners).toHaveLength(1);
      expect(conflicts).toHaveLength(9); // every loser failed loudly, none silently

      const audits = await prisma.intentTransition.findMany({
        where: { intentId: intent.id },
      });
      expect(audits).toHaveLength(1); // exactly-once: one transition, one audit row
      const final = await prisma.paymentIntent.findUniqueOrThrow({
        where: { id: intent.id },
      });
      expect(['DETECTED', 'EXPIRED']).toContain(final.status);
      expect(audits[0]!.fromStatus).toBe('PENDING');
      expect(audits[0]!.toStatus).toBe(final.status); // history matches reality
    },
    30_000,
  );

  it(
    'at-least-once delivery: 8 duplicate PAYMENT_FINALIZED events apply exactly once',
    async () => {
      const intent = await seedIntent({ status: 'CONFIRMED' });

      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          service.transition(intent.id, {
            type: 'PAYMENT_FINALIZED',
            overpaid: false,
          }),
        ),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const audits = await prisma.intentTransition.count({
        where: { intentId: intent.id },
      });
      expect(audits).toBe(1);
      const final = await prisma.paymentIntent.findUniqueOrThrow({
        where: { id: intent.id },
      });
      expect(final.status).toBe('FINALIZED');
      expect(final.flags).toEqual([]); // no phantom flags from replays
    },
    30_000,
  );
});

describe('one-time link race (FR-12)', () => {
  it(
    'three payments finalize concurrently → one wins clean, two flagged DUPLICATE_PAYMENT, no lost counter updates',
    async () => {
      const link = await prisma.paymentLink.create({
        data: {
          merchantId,
          slug: `race-link-${randomUUID()}`,
          type: 'ONE_TIME',
          amountMode: 'FIXED',
          fiatCurrency: 'USD',
          amountFiat: 100,
          token: 'SOL',
          maxUses: 1,
        },
      });
      // three customers scanned the same one-time QR; all their payments
      // reached CONFIRMED before any finalized — the worst case
      const intents = await Promise.all(
        Array.from({ length: 3 }, () =>
          seedIntent({ status: 'CONFIRMED', linkId: link.id }),
        ),
      );

      const views = await Promise.all(
        intents.map((intent) =>
          service.transition(intent.id, {
            type: 'PAYMENT_FINALIZED',
            overpaid: false,
          }),
        ),
      );

      // all finalize — the funds moved on-chain either way (never swallowed)
      expect(views.every((v) => v.status === 'FINALIZED')).toBe(true);
      const clean = views.filter((v) => !v.flags.includes('DUPLICATE_PAYMENT'));
      const flagged = views.filter((v) => v.flags.includes('DUPLICATE_PAYMENT'));
      expect(clean).toHaveLength(1); // exactly one first-finalized winner
      expect(flagged).toHaveLength(2); // every race loser is flagged

      const finalLink = await prisma.paymentLink.findUniqueOrThrow({
        where: { id: link.id },
      });
      expect(finalLink.useCount).toBe(3); // atomic increments — none lost
      expect(effectiveLinkStatus(finalLink, new Date())).toBe('COMPLETED');
    },
    30_000,
  );
});
