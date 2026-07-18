import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { verifyWebhookSignature } from './signature';
import { WebhookDispatcherService } from './webhook-dispatcher.service';

const NOW = new Date('2026-07-18T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

const ENV = {
  WEBHOOK_TIMEOUT_MS: 5_000,
  WEBHOOK_MAX_ATTEMPTS: 5,
  WEBHOOK_BACKOFF_BASE_MS: 30_000,
} as const;

function delivery(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wd_1',
    endpointId: 'ep_1',
    intentId: 'pi_1',
    event: 'intent.finalized',
    payload: { event: 'intent.finalized', data: { id: 'pi_1' } },
    status: 'PENDING',
    attempts: 0,
    nextAttemptAt: NOW,
    lastResponseCode: null,
    createdAt: NOW,
    endpoint: {
      id: 'ep_1',
      merchantId: 'm_1',
      url: 'https://merchant.example/hooks',
      secret: 'whsec_test',
      active: true,
      events: [],
    },
    ...overrides,
  };
}

function makeDispatcher(due: unknown[]) {
  const prisma = {
    webhookDelivery: {
      findMany: vi.fn().mockResolvedValue(due),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
  const config = {
    get: vi.fn((key: keyof typeof ENV) => ENV[key]),
  };
  const dispatcher = new WebhookDispatcherService(
    prisma as unknown as PrismaService,
    { now: () => NOW },
    config as unknown as ConfigService<Env, true>,
  );
  return { dispatcher, prisma };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WebhookDispatcherService', () => {
  it('delivers a due row: signed POST, then DELIVERED with the response code', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const { dispatcher, prisma } = makeDispatcher([delivery()]);

    expect(await dispatcher.tick()).toBe(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://merchant.example/hooks');
    expect(init.headers['donpay-event']).toBe('intent.finalized');
    expect(init.headers['donpay-delivery']).toBe('wd_1');
    // the signature verifies against the exact bytes sent
    expect(
      verifyWebhookSignature(
        'whsec_test',
        init.headers['donpay-signature'],
        init.body,
        { nowSeconds: NOW_SECONDS },
      ),
    ).toBe(true);

    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'wd_1' },
      data: { status: 'DELIVERED', lastResponseCode: 200, nextAttemptAt: null },
    });
  });

  it('a failing endpoint backs off exponentially: FAILED with 30s, then 2m', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    const first = makeDispatcher([delivery()]);
    await first.dispatcher.tick();
    expect(first.prisma.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'wd_1' },
      data: {
        status: 'FAILED',
        lastResponseCode: 500,
        nextAttemptAt: new Date(NOW.getTime() + 30_000), // base * 4^0
      },
    });

    const second = makeDispatcher([delivery({ status: 'FAILED', attempts: 1 })]);
    await second.dispatcher.tick();
    expect(second.prisma.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'wd_1' },
      data: {
        status: 'FAILED',
        lastResponseCode: 500,
        nextAttemptAt: new Date(NOW.getTime() + 120_000), // base * 4^1
      },
    });
  });

  it('the fifth failure dead-letters: DEAD, no next attempt (rule 3)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const { dispatcher, prisma } = makeDispatcher([
      delivery({ status: 'FAILED', attempts: 4 }),
    ]);

    await dispatcher.tick();

    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'wd_1' },
      data: { status: 'DEAD', lastResponseCode: null, nextAttemptAt: null },
    });
  });

  it('a lost optimistic claim skips the row — no double send', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { dispatcher, prisma } = makeDispatcher([delivery()]);
    prisma.webhookDelivery.updateMany.mockResolvedValue({ count: 0 });

    await dispatcher.tick();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.webhookDelivery.update).not.toHaveBeenCalled();
  });

  it('sweeps only due PENDING/FAILED rows', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { dispatcher, prisma } = makeDispatcher([]);
    await dispatcher.tick();
    expect(prisma.webhookDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ['PENDING', 'FAILED'] },
          nextAttemptAt: { lte: NOW },
        },
        take: 20,
      }),
    );
  });
});
