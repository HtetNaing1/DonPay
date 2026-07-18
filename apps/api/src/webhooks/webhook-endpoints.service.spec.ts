import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookEndpointsService } from './webhook-endpoints.service';

const NOW = new Date('2026-07-18T12:00:00.000Z');
const MERCHANT_ID = 'm_1';

function endpointRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ep_1',
    merchantId: MERCHANT_ID,
    url: 'https://merchant.example/hooks',
    secret: 'whsec_stored',
    active: true,
    events: ['intent.finalized'],
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    webhookEndpoint: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    webhookDelivery: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  const service = new WebhookEndpointsService(
    prisma as unknown as PrismaService,
    { now: () => NOW },
  );
  return { service, prisma };
}

describe('WebhookEndpointsService', () => {
  it('create mints a whsec_ secret, stores it, and returns it exactly once', async () => {
    const { service, prisma } = makeService();
    prisma.webhookEndpoint.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(endpointRow(data)),
    );

    const created = await service.create(MERCHANT_ID, {
      url: 'https://merchant.example/hooks',
      events: ['intent.finalized'],
      active: true,
    });

    const stored = prisma.webhookEndpoint.create.mock.calls[0][0].data;
    expect(stored.secret).toMatch(/^whsec_[A-Za-z0-9_-]{32}$/);
    expect(created.secret).toBe(stored.secret);
  });

  it('list never exposes secrets', async () => {
    const { service, prisma } = makeService();
    prisma.webhookEndpoint.findMany.mockResolvedValue([endpointRow()]);

    const [view] = await service.list(MERCHANT_ID);

    expect(prisma.webhookEndpoint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { merchantId: MERCHANT_ID } }),
    );
    expect(view).not.toHaveProperty('secret');
    expect(view).toEqual({
      id: 'ep_1',
      url: 'https://merchant.example/hooks',
      events: ['intent.finalized'],
      active: true,
    });
  });

  it("update and delete 404 on another tenant's endpoint — scoping, not a check", async () => {
    const { service, prisma } = makeService();
    prisma.webhookEndpoint.updateMany.mockResolvedValue({ count: 0 });
    prisma.webhookEndpoint.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(MERCHANT_ID, 'ep_other', { active: false }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(service.remove(MERCHANT_ID, 'ep_other')).rejects.toMatchObject(
      { status: 404 },
    );
    expect(prisma.webhookEndpoint.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ep_other', merchantId: MERCHANT_ID },
      }),
    );
  });

  it('deliveries are reachable only through an owned endpoint', async () => {
    const { service, prisma } = makeService();
    prisma.webhookEndpoint.findFirst.mockResolvedValue(null);
    await expect(
      service.deliveries(MERCHANT_ID, 'ep_other'),
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.webhookDelivery.findMany).not.toHaveBeenCalled();
  });

  it('redeliver marks a settled row due now; PENDING rows 409', async () => {
    const { service, prisma } = makeService();
    prisma.webhookDelivery.findFirst.mockResolvedValue({
      id: 'wd_1',
      intentId: 'pi_1',
      event: 'intent.finalized',
      status: 'DEAD',
      attempts: 5,
      lastResponseCode: null,
      nextAttemptAt: null,
      createdAt: NOW,
    });
    prisma.webhookDelivery.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'wd_1',
          intentId: 'pi_1',
          event: 'intent.finalized',
          attempts: 5,
          lastResponseCode: null,
          createdAt: NOW,
          ...data,
        }),
    );

    const view = await service.redeliver(MERCHANT_ID, 'wd_1');

    expect(prisma.webhookDelivery.findFirst).toHaveBeenCalledWith({
      where: { id: 'wd_1', endpoint: { merchantId: MERCHANT_ID } },
    });
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'wd_1' },
      data: { status: 'PENDING', nextAttemptAt: NOW },
    });
    expect(view.status).toBe('PENDING');

    prisma.webhookDelivery.findFirst.mockResolvedValue({
      id: 'wd_2',
      status: 'PENDING',
    });
    await expect(service.redeliver(MERCHANT_ID, 'wd_2')).rejects.toMatchObject({
      status: 409,
      code: 'conflict',
    });
  });
});
