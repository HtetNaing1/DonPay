import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { Clock } from '../common/clock';
import { Env } from '../config/env';
import { PaymentIntent } from '../generated/prisma/client';
import { PaymentIntentService } from '../intents/payment-intent.service';
import { TransitionConflictError } from '../intents/state-machine';
import { PrismaService } from '../prisma/prisma.service';
import { WatchQueueService } from '../queues/watch-queue.service';
import { ChainWatcherService } from './chain-watcher.service';
import { FakeChainAdapter } from './testing/fake-chain.adapter';

const NOW = new Date('2026-07-17T12:00:00.000Z');
const IN_TEN_MIN = new Date(NOW.getTime() + 600_000);
const PAYOUT = 'watch-merchant-wallet';
const REFERENCE = 'watch-ref-1';

const ENV = {
  WATCH_POLL_MS: 3_000,
  WATCH_TAIL_POLL_MS: 600_000,
  WATCH_TAIL_HOURS: 24,
  WATCH_MAX_BACKOFF_MS: 60_000,
} as const;

function intentRow(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    id: 'pi_w1',
    merchantId: 'm_1',
    linkId: null,
    reference: REFERENCE,
    fiatCurrency: 'USD',
    amountFiat: 2500,
    token: 'USDC',
    amountToken: 25_000_000n,
    rateLocked: '1',
    rateSource: 'test',
    quoteExpiresAt: IN_TEN_MIN,
    payoutAddress: PAYOUT,
    status: 'PENDING',
    flags: [],
    note: null,
    idempotencyKey: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as PaymentIntent;
}

function makeWatcher(intent: PaymentIntent | null, now: Date = NOW) {
  const adapter = new FakeChainAdapter();
  const prisma = {
    paymentIntent: { findUnique: vi.fn().mockResolvedValue(intent) },
    onchainPayment: {
      upsert: vi.fn().mockResolvedValue(undefined),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
  const intents = { transition: vi.fn().mockResolvedValue(undefined) };
  const watchQueue = { schedule: vi.fn().mockResolvedValue(undefined) };
  const clock: Clock = { now: () => now };
  const config = {
    get: vi.fn((key: keyof typeof ENV) => ENV[key]),
  };
  const watcher = new ChainWatcherService(
    prisma as unknown as PrismaService,
    intents as unknown as PaymentIntentService,
    watchQueue as unknown as WatchQueueService,
    adapter,
    clock,
    config as unknown as ConfigService<Env, true>,
  );
  return { watcher, adapter, prisma, intents, watchQueue };
}

const TICK = { intentId: 'pi_w1', mode: 'active', errorCount: 0 } as const;

function pay(
  adapter: FakeChainAdapter,
  amountTokenMinor: bigint,
  reference = REFERENCE,
): string {
  return adapter.submitPayment({
    reference,
    payoutAddress: PAYOUT,
    token: 'USDC',
    amountTokenMinor,
    payerAddress: 'buyer-wallet',
  });
}

describe('ChainWatcherService.tick — active watch', () => {
  it('applies WATCH_STARTED on the first tick of a CREATED intent', async () => {
    const { watcher, intents, watchQueue } = makeWatcher(
      intentRow({ status: 'CREATED' }),
    );
    await watcher.tick(TICK);
    expect(intents.transition).toHaveBeenCalledWith('pi_w1', {
      type: 'WATCH_STARTED',
    });
    expect(watchQueue.schedule).toHaveBeenCalledWith(
      { intentId: 'pi_w1', mode: 'active', errorCount: 0 },
      3_000,
    );
  });

  it('PENDING with nothing on chain: no transition, repoll in 3s', async () => {
    const { watcher, intents, watchQueue } = makeWatcher(intentRow());
    await watcher.tick(TICK);
    expect(intents.transition).not.toHaveBeenCalled();
    expect(watchQueue.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'active' }),
      3_000,
    );
  });

  it('PENDING with a payment on chain: records it and transitions PAYMENT_DETECTED', async () => {
    const { watcher, adapter, prisma, intents } = makeWatcher(intentRow());
    const signature = pay(adapter, 25_000_000n);

    await watcher.tick(TICK);

    expect(prisma.onchainPayment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { txSignature: signature },
        create: expect.objectContaining({
          intentId: 'pi_w1',
          txSignature: signature,
          amountToken: 25_000_000n,
          payerAddress: 'buyer-wallet',
        }),
      }),
    );
    expect(intents.transition).toHaveBeenCalledWith('pi_w1', {
      type: 'PAYMENT_DETECTED',
    });
  });

  it('PENDING past quote expiry with no payment: EXPIRED, switches to tail cadence', async () => {
    const { watcher, intents, watchQueue } = makeWatcher(
      intentRow({ quoteExpiresAt: new Date(NOW.getTime() - 1_000) }),
    );
    await watcher.tick(TICK);
    expect(intents.transition).toHaveBeenCalledWith('pi_w1', {
      type: 'QUOTE_EXPIRED',
    });
    expect(watchQueue.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'tail' }),
      600_000,
    );
  });

  it('DETECTED underpaid: transitions PAYMENT_UNDERPAID and stops the watch', async () => {
    const { watcher, prisma, intents, watchQueue } = makeWatcher(
      intentRow({ status: 'DETECTED' }),
    );
    prisma.onchainPayment.findFirst.mockResolvedValue({
      id: 'op_1',
      txSignature: 'sig-under',
      amountToken: 24_000_000n, // quoted 25_000_000
    });

    await watcher.tick(TICK);

    expect(intents.transition).toHaveBeenCalledWith('pi_w1', {
      type: 'PAYMENT_UNDERPAID',
    });
    expect(watchQueue.schedule).not.toHaveBeenCalled();
  });

  it('DETECTED with exact amount still PROCESSED: keeps polling without transitioning', async () => {
    const { watcher, adapter, prisma, intents, watchQueue } = makeWatcher(
      intentRow({ status: 'DETECTED' }),
    );
    const signature = pay(adapter, 25_000_000n);
    prisma.onchainPayment.findFirst.mockResolvedValue({
      id: 'op_1',
      txSignature: signature,
      amountToken: 25_000_000n,
    });

    await watcher.tick(TICK);

    expect(intents.transition).not.toHaveBeenCalled();
    expect(watchQueue.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'active' }),
      3_000,
    );
  });

  it('DETECTED once the tx confirms: transitions PAYMENT_CONFIRMED', async () => {
    const { watcher, adapter, prisma, intents } = makeWatcher(
      intentRow({ status: 'DETECTED' }),
    );
    const signature = pay(adapter, 25_000_000n);
    adapter.setFinality(signature, 'CONFIRMED');
    prisma.onchainPayment.findFirst.mockResolvedValue({
      id: 'op_1',
      txSignature: signature,
      amountToken: 25_000_000n,
    });

    await watcher.tick(TICK);

    expect(intents.transition).toHaveBeenCalledWith('pi_w1', {
      type: 'PAYMENT_CONFIRMED',
    });
  });

  it('CONFIRMED once finalized: PAYMENT_FINALIZED with the overpaid flag, stamps finalizedAt, stops', async () => {
    const { watcher, adapter, prisma, intents, watchQueue } = makeWatcher(
      intentRow({ status: 'CONFIRMED' }),
    );
    const signature = pay(adapter, 30_000_000n); // quoted 25_000_000 → overpaid
    adapter.setFinality(signature, 'FINALIZED');
    prisma.onchainPayment.findFirst.mockResolvedValue({
      id: 'op_1',
      txSignature: signature,
      amountToken: 30_000_000n,
    });

    await watcher.tick(TICK);

    expect(intents.transition).toHaveBeenCalledWith('pi_w1', {
      type: 'PAYMENT_FINALIZED',
      overpaid: true,
    });
    expect(prisma.onchainPayment.update).toHaveBeenCalledWith({
      where: { id: 'op_1' },
      data: { finalizedAt: NOW },
    });
    expect(watchQueue.schedule).not.toHaveBeenCalled();
  });
});

describe('ChainWatcherService.tick — tail watch and stop conditions', () => {
  it('EXPIRED with a late payment: LATE_PAYMENT_DETECTED, payment recorded, watch ends', async () => {
    const { watcher, adapter, prisma, intents, watchQueue } = makeWatcher(
      intentRow({
        status: 'EXPIRED',
        quoteExpiresAt: new Date(NOW.getTime() - 3_600_000),
      }),
    );
    pay(adapter, 25_000_000n);

    await watcher.tick({ ...TICK, mode: 'tail' });

    expect(prisma.onchainPayment.upsert).toHaveBeenCalled();
    expect(intents.transition).toHaveBeenCalledWith('pi_w1', {
      type: 'LATE_PAYMENT_DETECTED',
    });
    expect(watchQueue.schedule).not.toHaveBeenCalled();
  });

  it('EXPIRED with nothing, within 24h: keeps the low-frequency tail', async () => {
    const { watcher, intents, watchQueue } = makeWatcher(
      intentRow({
        status: 'EXPIRED',
        quoteExpiresAt: new Date(NOW.getTime() - 3_600_000), // 1h ago
      }),
    );
    await watcher.tick({ ...TICK, mode: 'tail' });
    expect(intents.transition).not.toHaveBeenCalled();
    expect(watchQueue.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'tail' }),
      600_000,
    );
  });

  it('EXPIRED past the 24h tail window: the watch ends silently', async () => {
    const { watcher, watchQueue } = makeWatcher(
      intentRow({
        status: 'EXPIRED',
        quoteExpiresAt: new Date(NOW.getTime() - 25 * 3_600_000), // 25h ago
      }),
    );
    await watcher.tick({ ...TICK, mode: 'tail' });
    expect(watchQueue.schedule).not.toHaveBeenCalled();
  });

  it('terminal statuses stop immediately', async () => {
    for (const status of ['FINALIZED', 'UNDERPAID', 'LATE_PAYMENT'] as const) {
      const { watcher, intents, watchQueue } = makeWatcher(
        intentRow({ status }),
      );
      await watcher.tick(TICK);
      expect(intents.transition).not.toHaveBeenCalled();
      expect(watchQueue.schedule).not.toHaveBeenCalled();
    }
  });

  it('a vanished intent (rolled-back creation) stops without scheduling', async () => {
    const { watcher, watchQueue } = makeWatcher(null);
    await watcher.tick(TICK);
    expect(watchQueue.schedule).not.toHaveBeenCalled();
  });
});

describe('ChainWatcherService.tick — resilience', () => {
  it('RPC errors back off exponentially instead of killing the watch', async () => {
    const { watcher, adapter, watchQueue } = makeWatcher(intentRow());
    vi.spyOn(adapter, 'findPaymentsByReference').mockRejectedValue(
      new Error('helius 429'),
    );

    await watcher.tick(TICK);
    expect(watchQueue.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ errorCount: 1 }),
      6_000, // 3s * 2^1
    );

    watchQueue.schedule.mockClear();
    await watcher.tick({ ...TICK, errorCount: 5 });
    expect(watchQueue.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ errorCount: 6 }),
      60_000, // capped at WATCH_MAX_BACKOFF_MS
    );
  });

  it('a successful tick resets the error count', async () => {
    const { watcher, watchQueue } = makeWatcher(intentRow());
    await watcher.tick({ ...TICK, errorCount: 4 });
    expect(watchQueue.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ errorCount: 0 }),
      3_000,
    );
  });

  it('a transition conflict (lost race) is benign: re-read next tick, no backoff', async () => {
    const { watcher, adapter, intents, watchQueue } = makeWatcher(intentRow());
    pay(adapter, 25_000_000n);
    intents.transition.mockRejectedValue(
      new TransitionConflictError('EXPIRED', 'PAYMENT_DETECTED', 'lost race'),
    );

    await watcher.tick(TICK);

    expect(watchQueue.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ errorCount: 0 }),
      3_000,
    );
  });
});
