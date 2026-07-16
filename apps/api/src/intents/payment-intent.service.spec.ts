import { ConfigService } from '@nestjs/config';
import { paymentIntentSchema } from '@donpay/shared';
import { describe, expect, it, vi } from 'vitest';
import { Clock } from '../common/clock';
import { IdempotencyService } from '../common/idempotency.service';
import { Env } from '../config/env';
import {
  PaymentIntent,
  PaymentLink,
  Prisma,
  WalletAddress,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Quote, QuoteService } from '../rates/quote.service';
import { PaymentIntentService } from './payment-intent.service';

const NOW = new Date('2026-07-15T12:00:00.000Z');
const MERCHANT_ID = 'm_1';
const PAYOUT_ADDRESS = 'So11111111111111111111111111111111111111112';
const REFERENCE = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const QUOTE: Quote = {
  fiatCurrency: 'USD',
  amountFiatMinor: 2500,
  token: 'USDC',
  amountTokenMinor: 25_000_000n,
  rate: '1',
  rateSource: 'coingecko',
  lockedAt: NOW,
  lockedUntil: new Date(NOW.getTime() + 600_000),
};

function walletRow(overrides: Partial<WalletAddress> = {}): WalletAddress {
  return {
    id: 'w_1',
    merchantId: MERCHANT_ID,
    address: PAYOUT_ADDRESS,
    chain: 'SOLANA',
    verifiedAt: NOW,
    isDefault: true,
    ...overrides,
  };
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
    note: 'Blue hoodie',
    expiresAt: null,
    maxUses: null,
    useCount: 0,
    status: 'ACTIVE',
    createdAt: NOW,
    ...overrides,
  };
}

/** Echoes what the service persisted, defaulting the DB-generated columns. */
function intentRow(data: Record<string, unknown>): PaymentIntent {
  return {
    id: 'pi_1',
    merchantId: MERCHANT_ID,
    linkId: null,
    reference: REFERENCE,
    fiatCurrency: 'USD',
    amountFiat: 2500,
    token: 'USDC',
    amountToken: 25_000_000n,
    rateLocked: '1',
    rateSource: 'coingecko',
    quoteExpiresAt: QUOTE.lockedUntil,
    payoutAddress: PAYOUT_ADDRESS,
    status: 'CREATED',
    flags: [],
    note: null,
    idempotencyKey: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...data,
  } as PaymentIntent;
}

function makeService() {
  const prisma = {
    walletAddress: {
      findFirst: vi.fn().mockResolvedValue(walletRow()),
    },
    paymentLink: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    paymentIntent: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(intentRow(data)),
      ),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(intentRow(data)),
      ),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    intentTransition: {
      create: vi.fn().mockResolvedValue(undefined),
    },
    $queryRaw: vi.fn(),
    idempotencyRecord: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(undefined),
    },
    $transaction: vi.fn(
      (callback: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
        callback(prisma),
    ),
  };
  const quoteService = {
    createQuote: vi.fn().mockResolvedValue(QUOTE),
  };
  const referenceGenerator = { generateReference: vi.fn(() => REFERENCE) };
  const clock: Clock = { now: () => NOW };
  const config = {
    get: vi.fn(() => 'https://pay.test'),
  };
  const service = new PaymentIntentService(
    prisma as unknown as PrismaService,
    quoteService as unknown as QuoteService,
    new IdempotencyService(prisma as unknown as PrismaService),
    referenceGenerator,
    clock,
    config as unknown as ConfigService<Env, true>,
  );
  return { service, prisma, quoteService, referenceGenerator };
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

const API_INPUT = {
  fiatCurrency: 'USD',
  amountFiat: 2500,
  token: 'USDC',
} as const;

describe('PaymentIntentService.createFromApi', () => {
  it('embeds the locked quote, a fresh reference, and the default payout wallet', async () => {
    const { service, prisma, quoteService } = makeService();

    const view = await service.createFromApi(MERCHANT_ID, {
      ...API_INPUT,
      note: 'order #42',
    });

    expect(quoteService.createQuote).toHaveBeenCalledWith({
      fiatCurrency: 'USD',
      amountFiatMinor: 2500,
      token: 'USDC',
    });
    const stored = prisma.paymentIntent.create.mock.calls[0][0].data;
    expect(stored).toMatchObject({
      merchantId: MERCHANT_ID,
      linkId: null,
      reference: REFERENCE,
      amountFiat: 2500,
      amountToken: 25_000_000n,
      rateLocked: '1',
      rateSource: 'coingecko',
      quoteExpiresAt: QUOTE.lockedUntil,
      payoutAddress: PAYOUT_ADDRESS,
      note: 'order #42',
      idempotencyKey: null,
    });
    // the response is exactly the documented wire shape
    expect(paymentIntentSchema.parse(view)).toEqual(view);
    expect(view.status).toBe('CREATED');
    expect(view.amountToken).toBe('25000000');
    expect(view.checkoutUrl).toBe('https://pay.test/checkout/pi_1');
  });

  it('409s payout_wallet_missing before pricing when no verified default wallet exists', async () => {
    const { service, prisma, quoteService } = makeService();
    prisma.walletAddress.findFirst.mockResolvedValue(null);

    await expect(
      service.createFromApi(MERCHANT_ID, API_INPUT),
    ).rejects.toMatchObject({ status: 409, code: 'payout_wallet_missing' });
    expect(quoteService.createQuote).not.toHaveBeenCalled();
    expect(prisma.paymentIntent.create).not.toHaveBeenCalled();
  });

  it('replays a stored Idempotency-Key response without re-executing (rule 5)', async () => {
    const { service, prisma, quoteService } = makeService();
    const storedView = { id: 'pi_stored' };
    prisma.idempotencyRecord.findUnique.mockResolvedValue({
      response: storedView,
    });

    const view = await service.createFromApi(MERCHANT_ID, API_INPUT, 'key-1');

    expect(view).toEqual(storedView);
    expect(prisma.idempotencyRecord.findUnique).toHaveBeenCalledWith({
      where: { key_merchantId: { key: 'key-1', merchantId: MERCHANT_ID } },
    });
    expect(quoteService.createQuote).not.toHaveBeenCalled();
    expect(prisma.paymentIntent.create).not.toHaveBeenCalled();
  });

  it('writes the idempotency record in the same transaction as the intent', async () => {
    const { service, prisma } = makeService();

    const view = await service.createFromApi(MERCHANT_ID, API_INPUT, 'key-1');

    expect(
      prisma.paymentIntent.create.mock.calls[0][0].data.idempotencyKey,
    ).toBe('key-1');
    const record = prisma.idempotencyRecord.create.mock.calls[0][0].data;
    expect(record).toMatchObject({
      key: 'key-1',
      merchantId: MERCHANT_ID,
      response: view,
    });
    expect(record.responseHash).toMatch(/^[0-9a-f]{64}$/);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("replays the winner's response after losing a same-key race", async () => {
    const { service, prisma } = makeService();
    const storedView = { id: 'pi_winner' };
    prisma.idempotencyRecord.findUnique
      .mockResolvedValueOnce(null) // pre-check: nothing stored yet
      .mockResolvedValue({ response: storedView }); // re-read after the race
    prisma.idempotencyRecord.create.mockRejectedValue(uniqueViolation());

    const view = await service.createFromApi(MERCHANT_ID, API_INPUT, 'key-1');
    expect(view).toEqual(storedView);
  });
});

describe('PaymentIntentService.openLink', () => {
  it('creates an intent for the link merchant with the fixed amount and note snapshot', async () => {
    const { service, prisma, quoteService } = makeService();
    prisma.paymentLink.findUnique.mockResolvedValue(
      linkRow({ merchantId: 'm_link_owner' }),
    );
    prisma.walletAddress.findFirst.mockResolvedValue(
      walletRow({ merchantId: 'm_link_owner' }),
    );

    const view = await service.openLink('slug_abc123', {});

    expect(prisma.paymentLink.findUnique).toHaveBeenCalledWith({
      where: { slug: 'slug_abc123' },
    });
    expect(quoteService.createQuote).toHaveBeenCalledWith(
      expect.objectContaining({ amountFiatMinor: 2500 }),
    );
    expect(prisma.paymentIntent.create.mock.calls[0][0].data).toMatchObject({
      merchantId: 'm_link_owner',
      linkId: 'l_1',
      note: 'Blue hoodie',
      idempotencyKey: null,
    });
    expect(view.linkId).toBe('l_1');
  });

  it('rejects an amount override on a FIXED link', async () => {
    const { service, prisma } = makeService();
    prisma.paymentLink.findUnique.mockResolvedValue(linkRow());

    await expect(
      service.openLink('slug_abc123', { amountFiat: 100 }),
    ).rejects.toMatchObject({ status: 400, code: 'validation_failed' });
  });

  it('PAYER_CHOOSES: requires an amount and enforces the min/max bounds', async () => {
    const { service, prisma, quoteService } = makeService();
    prisma.paymentLink.findUnique.mockResolvedValue(
      linkRow({
        amountMode: 'PAYER_CHOOSES',
        amountFiat: null,
        minFiat: 500,
        maxFiat: 10_000,
      }),
    );

    for (const input of [{}, { amountFiat: 499 }, { amountFiat: 10_001 }]) {
      await expect(
        service.openLink('slug_abc123', input),
      ).rejects.toMatchObject({ status: 400, code: 'validation_failed' });
    }
    expect(quoteService.createQuote).not.toHaveBeenCalled();

    await service.openLink('slug_abc123', { amountFiat: 5000 });
    expect(quoteService.createQuote).toHaveBeenCalledWith(
      expect.objectContaining({ amountFiatMinor: 5000 }),
    );
  });

  it('404s an unknown slug', async () => {
    const { service, prisma } = makeService();
    prisma.paymentLink.findUnique.mockResolvedValue(null);

    await expect(service.openLink('nope', {})).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });

  it('409s link_not_payable for paused and effectively-expired links', async () => {
    const { service, prisma } = makeService();

    prisma.paymentLink.findUnique.mockResolvedValue(
      linkRow({ status: 'PAUSED' }),
    );
    await expect(service.openLink('slug_abc123', {})).rejects.toMatchObject({
      status: 409,
      code: 'link_not_payable',
    });

    prisma.paymentLink.findUnique.mockResolvedValue(
      linkRow({ expiresAt: new Date(NOW.getTime() - 1000) }),
    );
    await expect(service.openLink('slug_abc123', {})).rejects.toMatchObject({
      status: 409,
      code: 'link_not_payable',
    });
  });

  it('does not consume a use at open time — useCount counts payments, not checkouts', async () => {
    const { service, prisma } = makeService();
    prisma.paymentLink.findUnique.mockResolvedValue(
      linkRow({ type: 'ONE_TIME', maxUses: 1 }),
    );

    await service.openLink('slug_abc123', {});

    expect(prisma.paymentLink.update).not.toHaveBeenCalled();
    expect(prisma.paymentLink.updateMany).not.toHaveBeenCalled();
  });
});

describe('PaymentIntentService.transition', () => {
  function lockReturns(
    prisma: ReturnType<typeof makeService>['prisma'],
    status: string,
    flags: string[] = [],
  ) {
    prisma.$queryRaw.mockResolvedValue([{ id: 'pi_1' }]);
    prisma.paymentIntent.findUniqueOrThrow.mockResolvedValue({
      status,
      flags,
    });
  }

  it('applies a valid transition under a row lock and writes the audit row', async () => {
    const { service, prisma } = makeService();
    lockReturns(prisma, 'CREATED');

    const view = await service.transition('pi_1', { type: 'WATCH_STARTED' });

    // the lock and the writes share one transaction
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const sql = (prisma.$queryRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('FOR UPDATE');
    expect(prisma.paymentIntent.update).toHaveBeenCalledWith({
      where: { id: 'pi_1' },
      data: { status: 'PENDING', flags: [] },
    });
    expect(prisma.intentTransition.create).toHaveBeenCalledWith({
      data: {
        intentId: 'pi_1',
        fromStatus: 'CREATED',
        toStatus: 'PENDING',
        event: 'WATCH_STARTED',
      },
    });
    expect(view.status).toBe('PENDING');
  });

  it('rejects an invalid event with a 409 conflict and writes nothing', async () => {
    const { service, prisma } = makeService();
    lockReturns(prisma, 'FINALIZED');

    await expect(
      service.transition('pi_1', { type: 'WATCH_STARTED' }),
    ).rejects.toMatchObject({ status: 409, code: 'conflict' });
    expect(prisma.paymentIntent.update).not.toHaveBeenCalled();
    expect(prisma.intentTransition.create).not.toHaveBeenCalled();
  });

  it('unions new flags with existing ones, never duplicating', async () => {
    const { service, prisma } = makeService();
    lockReturns(prisma, 'CONFIRMED', ['OVERPAID']);

    await service.transition('pi_1', {
      type: 'PAYMENT_FINALIZED',
      overpaid: true,
    });

    expect(prisma.paymentIntent.update).toHaveBeenCalledWith({
      where: { id: 'pi_1' },
      data: { status: 'FINALIZED', flags: ['OVERPAID'] },
    });
  });

  it('records a flag-only duplicate-payment event without changing status (FR-12)', async () => {
    const { service, prisma } = makeService();
    lockReturns(prisma, 'FINALIZED');

    const view = await service.transition('pi_1', {
      type: 'DUPLICATE_PAYMENT_DETECTED',
    });

    expect(prisma.paymentIntent.update).toHaveBeenCalledWith({
      where: { id: 'pi_1' },
      data: { status: 'FINALIZED', flags: ['DUPLICATE_PAYMENT'] },
    });
    expect(prisma.intentTransition.create).toHaveBeenCalledWith({
      data: {
        intentId: 'pi_1',
        fromStatus: 'FINALIZED',
        toStatus: 'FINALIZED',
        event: 'DUPLICATE_PAYMENT_DETECTED',
      },
    });
    expect(view.flags).toContain('DUPLICATE_PAYMENT');
  });

  it('404s an unknown intent without writing', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(
      service.transition('pi_nope', { type: 'WATCH_STARTED' }),
    ).rejects.toMatchObject({ status: 404, code: 'not_found' });
    expect(prisma.paymentIntent.update).not.toHaveBeenCalled();
  });
});

describe('PaymentIntentService.get', () => {
  it('returns the merchant-scoped view', async () => {
    const { service, prisma } = makeService();
    prisma.paymentIntent.findFirst.mockResolvedValue(
      intentRow({
        reference: REFERENCE,
        fiatCurrency: 'USD',
        amountFiat: 2500,
        token: 'USDC',
        amountToken: 25_000_000n,
        rateLocked: '1',
        rateSource: 'coingecko',
        quoteExpiresAt: QUOTE.lockedUntil,
        payoutAddress: PAYOUT_ADDRESS,
      }),
    );

    const view = await service.get(MERCHANT_ID, 'pi_1');

    expect(prisma.paymentIntent.findFirst).toHaveBeenCalledWith({
      where: { id: 'pi_1', merchantId: MERCHANT_ID },
    });
    expect(paymentIntentSchema.parse(view)).toEqual(view);
  });

  it("404s another tenant's intent — scoping, not a controller check", async () => {
    const { service, prisma } = makeService();
    prisma.paymentIntent.findFirst.mockResolvedValue(null);

    await expect(service.get(MERCHANT_ID, 'pi_other')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });
});
