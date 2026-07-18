import { describe, expect, it, vi } from 'vitest';
import { PaymentIntentView } from '@donpay/shared';
import { Prisma } from '../generated/prisma/client';
import { WebhookOutboxService } from './webhook-outbox.service';

const NOW = new Date('2026-07-18T12:00:00.000Z');
const INTENT = { id: 'pi_1', status: 'FINALIZED' } as PaymentIntentView;

function makeOutbox() {
  const tx = {
    webhookEndpoint: { findMany: vi.fn().mockResolvedValue([]) },
    webhookDelivery: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  const service = new WebhookOutboxService({ now: () => NOW });
  return { service, tx: tx as unknown as Prisma.TransactionClient, mocks: tx };
}

const ENTRY = {
  merchantId: 'm_1',
  intentId: 'pi_1',
  event: 'intent.finalized' as const,
  intent: INTENT,
};

describe('WebhookOutboxService.enqueue', () => {
  it('writes one due delivery row per subscribed endpoint, through the given tx', async () => {
    const { service, tx, mocks } = makeOutbox();
    mocks.webhookEndpoint.findMany.mockResolvedValue([
      { id: 'ep_1' },
      { id: 'ep_2' },
    ]);

    await service.enqueue(tx, ENTRY);

    // only active endpoints subscribed to this event (or to everything)
    expect(mocks.webhookEndpoint.findMany).toHaveBeenCalledWith({
      where: {
        merchantId: 'm_1',
        active: true,
        OR: [
          { events: { isEmpty: true } },
          { events: { has: 'intent.finalized' } },
        ],
      },
      select: { id: true },
    });
    const { data } = mocks.webhookDelivery.createMany.mock.calls[0][0];
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      endpointId: 'ep_1',
      intentId: 'pi_1',
      event: 'intent.finalized',
      nextAttemptAt: NOW, // due immediately
      payload: {
        event: 'intent.finalized',
        occurredAt: NOW.toISOString(),
        data: INTENT, // snapshot at transition time
      },
    });
  });

  it('writes nothing when no endpoint is subscribed', async () => {
    const { service, tx, mocks } = makeOutbox();
    await service.enqueue(tx, ENTRY);
    expect(mocks.webhookDelivery.createMany).not.toHaveBeenCalled();
  });
});
