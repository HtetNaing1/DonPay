import { CreatePaymentLinkInput } from '@donpay/shared';
import { describe, expect, it, vi } from 'vitest';
import { Clock } from '../common/clock';
import { PaymentLink, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { effectiveLinkStatus } from './link-status';
import { LinksService } from './links.service';

const NOW = new Date('2026-07-15T12:00:00.000Z');
const MERCHANT_ID = 'm_1';

function makeService() {
  const prisma = {
    paymentLink: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    paymentIntent: {
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn(
      (callback: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
        callback(prisma),
    ),
  };
  const clock: Clock = { now: () => NOW };
  const service = new LinksService(prisma as unknown as PrismaService, clock);
  return { service, prisma };
}

function linkRow(overrides: Partial<PaymentLink> = {}): PaymentLink {
  return {
    id: 'l_1',
    merchantId: MERCHANT_ID,
    slug: 'slug_abc123',
    type: 'REUSABLE',
    amountMode: 'FIXED',
    fiatCurrency: 'USD',
    amountFiat: 2500,
    minFiat: null,
    maxFiat: null,
    token: 'USDC',
    note: null,
    expiresAt: null,
    maxUses: null,
    useCount: 0,
    status: 'ACTIVE',
    createdAt: NOW,
    ...overrides,
  };
}

const FIXED_INPUT: CreatePaymentLinkInput = {
  type: 'REUSABLE',
  amountMode: 'FIXED',
  fiatCurrency: 'USD',
  amountFiat: 2500,
  token: 'USDC',
};

describe('LinksService.create', () => {
  it('generates a random URL-safe slug and stores the link ACTIVE', async () => {
    const { service, prisma } = makeService();
    prisma.paymentLink.create.mockImplementation(
      ({ data }: { data: PaymentLink }) => Promise.resolve(linkRow(data)),
    );

    const link = await service.create(MERCHANT_ID, FIXED_INPUT);

    expect(link.slug).toMatch(/^[A-Za-z0-9_-]{11}$/);
    expect(link.status).toBe('ACTIVE');
    const stored = prisma.paymentLink.create.mock.calls[0][0].data;
    expect(stored.merchantId).toBe(MERCHANT_ID);
    expect(stored.amountFiat).toBe(2500);
    expect(stored.maxUses).toBeNull();
  });

  it('forces maxUses = 1 for ONE_TIME links', async () => {
    const { service, prisma } = makeService();
    prisma.paymentLink.create.mockImplementation(
      ({ data }: { data: PaymentLink }) => Promise.resolve(linkRow(data)),
    );

    await service.create(MERCHANT_ID, { ...FIXED_INPUT, type: 'ONE_TIME' });
    expect(prisma.paymentLink.create.mock.calls[0][0].data.maxUses).toBe(1);
  });

  it('re-mints the slug on a unique-constraint collision', async () => {
    const { service, prisma } = makeService();
    const collision = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    prisma.paymentLink.create
      .mockRejectedValueOnce(collision)
      .mockImplementation(({ data }: { data: PaymentLink }) =>
        Promise.resolve(linkRow(data)),
      );

    await service.create(MERCHANT_ID, FIXED_INPUT);

    expect(prisma.paymentLink.create).toHaveBeenCalledTimes(2);
    const [first, second] = prisma.paymentLink.create.mock.calls;
    expect(first[0].data.slug).not.toBe(second[0].data.slug);
  });
});

describe('LinksService.list / get', () => {
  it('lists merchant-scoped links with effective status applied', async () => {
    const { service, prisma } = makeService();
    prisma.paymentLink.findMany.mockResolvedValue([
      linkRow(),
      linkRow({ id: 'l_2', expiresAt: new Date(NOW.getTime() - 1000) }),
      linkRow({ id: 'l_3', maxUses: 1, useCount: 1 }),
      linkRow({ id: 'l_4', status: 'PAUSED' }),
    ]);

    const links = await service.list(MERCHANT_ID);

    expect(prisma.paymentLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { merchantId: MERCHANT_ID } }),
    );
    expect(links.map((l) => l.status)).toEqual([
      'ACTIVE',
      'EXPIRED',
      'COMPLETED',
      'PAUSED',
    ]);
    expect(links[1].expiresAt).toBe(
      new Date(NOW.getTime() - 1000).toISOString(),
    );
  });

  it("404s another tenant's link — scoping, not a controller check", async () => {
    const { service, prisma } = makeService();
    prisma.paymentLink.findFirst.mockResolvedValue(null);
    await expect(service.get(MERCHANT_ID, 'l_other')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
    expect(prisma.paymentLink.findFirst).toHaveBeenCalledWith({
      where: { id: 'l_other', merchantId: MERCHANT_ID },
    });
  });
});

describe('LinksService.update', () => {
  it('pauses and resumes an active link', async () => {
    const { service, prisma } = makeService();
    prisma.paymentLink.findFirst.mockResolvedValue(linkRow());
    prisma.paymentLink.update.mockResolvedValue(linkRow({ status: 'PAUSED' }));

    const link = await service.update(MERCHANT_ID, 'l_1', {
      status: 'PAUSED',
    });

    expect(prisma.paymentLink.update).toHaveBeenCalledWith({
      where: { id: 'l_1' },
      data: { status: 'PAUSED' },
    });
    expect(link.status).toBe('PAUSED');
  });

  it('applies only the provided patch fields, honoring explicit nulls', async () => {
    const { service, prisma } = makeService();
    prisma.paymentLink.findFirst.mockResolvedValue(
      linkRow({ expiresAt: NOW, maxUses: 5 }),
    );
    prisma.paymentLink.update.mockResolvedValue(linkRow());

    await service.update(MERCHANT_ID, 'l_1', {
      expiresAt: null,
      note: 'updated',
    });

    expect(prisma.paymentLink.update).toHaveBeenCalledWith({
      where: { id: 'l_1' },
      data: { expiresAt: null, note: 'updated' },
    });
  });

  it('rejects edits to a link the system already closed', async () => {
    const { service, prisma } = makeService();
    prisma.paymentLink.findFirst.mockResolvedValue(
      linkRow({ status: 'COMPLETED' }),
    );
    await expect(
      service.update(MERCHANT_ID, 'l_1', { status: 'PAUSED' }),
    ).rejects.toMatchObject({ status: 409, code: 'conflict' });
    expect(prisma.paymentLink.update).not.toHaveBeenCalled();
  });

  it('lets an effectively-expired link be revived by extending expiry', async () => {
    const { service, prisma } = makeService();
    const pastExpiry = new Date(NOW.getTime() - 1000);
    const future = new Date(NOW.getTime() + 86_400_000);
    prisma.paymentLink.findFirst.mockResolvedValue(
      linkRow({ expiresAt: pastExpiry }), // stored ACTIVE, effectively EXPIRED
    );
    prisma.paymentLink.update.mockResolvedValue(linkRow({ expiresAt: future }));

    const link = await service.update(MERCHANT_ID, 'l_1', {
      expiresAt: future,
    });
    expect(link.status).toBe('ACTIVE');
  });
});

describe('LinksService.remove', () => {
  it('deletes a link that has no intents', async () => {
    const { service, prisma } = makeService();
    prisma.paymentLink.findFirst.mockResolvedValue(linkRow());

    await service.remove(MERCHANT_ID, 'l_1');

    expect(prisma.paymentIntent.count).toHaveBeenCalledWith({
      where: { linkId: 'l_1' },
    });
    expect(prisma.paymentLink.delete).toHaveBeenCalledWith({
      where: { id: 'l_1' },
    });
  });

  it('409s when the link has payment history', async () => {
    const { service, prisma } = makeService();
    prisma.paymentLink.findFirst.mockResolvedValue(linkRow());
    prisma.paymentIntent.count.mockResolvedValue(2);

    await expect(service.remove(MERCHANT_ID, 'l_1')).rejects.toMatchObject({
      status: 409,
      code: 'conflict',
    });
    expect(prisma.paymentLink.delete).not.toHaveBeenCalled();
  });

  it("404s another tenant's link without deleting", async () => {
    const { service, prisma } = makeService();
    prisma.paymentLink.findFirst.mockResolvedValue(null);

    await expect(service.remove(MERCHANT_ID, 'l_other')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
    expect(prisma.paymentLink.delete).not.toHaveBeenCalled();
  });
});

describe('effectiveLinkStatus', () => {
  const base = {
    status: 'ACTIVE',
    expiresAt: null,
    maxUses: null,
    useCount: 0,
  } as const;

  it('derives EXPIRED and COMPLETED from time and usage', () => {
    expect(effectiveLinkStatus({ ...base }, NOW)).toBe('ACTIVE');
    expect(effectiveLinkStatus({ ...base, expiresAt: NOW }, NOW)).toBe(
      'EXPIRED',
    );
    expect(
      effectiveLinkStatus({ ...base, maxUses: 3, useCount: 3 }, NOW),
    ).toBe('COMPLETED');
    expect(
      effectiveLinkStatus({ ...base, maxUses: 3, useCount: 2 }, NOW),
    ).toBe('ACTIVE');
  });

  it('never overrides an explicit non-ACTIVE stored status', () => {
    expect(
      effectiveLinkStatus(
        { ...base, status: 'PAUSED', expiresAt: new Date(0) },
        NOW,
      ),
    ).toBe('PAUSED');
  });
});
