import { describe, expect, it } from 'vitest';
import {
  createApiKeySchema,
  createPaymentIntentSchema,
  createPaymentLinkSchema,
  createWebhookEndpointSchema,
  loginSchema,
  nonceRequestSchema,
  signupSchema,
  solanaAddressSchema,
  updatePaymentLinkSchema,
  walletVerifySchema,
} from './index';

// Valid devnet-style base58 pubkey (44 chars)
const ADDRESS = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
const SIGNATURE =
  '3AsdoZ8kMEVFBX6ZKUmG5CNSKKDYw8jCTfwHNRJhhmFcbXvVDTqW3AsdoZ8kMEVFBX6ZKUmG5CNSKKDYw8jCTf';

describe('auth schemas', () => {
  it('accepts a valid signup and rejects weak passwords / bad emails', () => {
    expect(
      signupSchema.safeParse({ email: 'a@b.co', password: 'longenough', name: 'Htet' }).success,
    ).toBe(true);
    expect(
      signupSchema.safeParse({ email: 'a@b.co', password: 'short', name: 'Htet' }).success,
    ).toBe(false);
    expect(
      signupSchema.safeParse({ email: 'not-an-email', password: 'longenough', name: 'H' }).success,
    ).toBe(false);
  });

  it('validates login bodies', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });

  it('validates nonce requests and wallet-verify payloads', () => {
    expect(
      nonceRequestSchema.safeParse({ address: ADDRESS, purpose: 'WALLET_VERIFY' }).success,
    ).toBe(true);
    expect(nonceRequestSchema.safeParse({ address: 'IIII', purpose: 'WALLET_VERIFY' }).success).toBe(
      false,
    );

    const valid = walletVerifySchema.safeParse({
      message: {
        domain: 'donpay.dev',
        address: ADDRESS,
        nonce: 'a'.repeat(32),
        issuedAt: '2026-07-13T00:00:00.000Z',
      },
      signature: SIGNATURE,
    });
    expect(valid.success).toBe(true);

    const shortNonce = walletVerifySchema.safeParse({
      message: {
        domain: 'donpay.dev',
        address: ADDRESS,
        nonce: 'short',
        issuedAt: '2026-07-13T00:00:00.000Z',
      },
      signature: SIGNATURE,
    });
    expect(shortNonce.success).toBe(false);
  });

  it('rejects base58 addresses containing excluded characters (0, O, I, l)', () => {
    expect(solanaAddressSchema.safeParse('0OIl'.repeat(10)).success).toBe(false);
  });
});

describe('createPaymentLinkSchema', () => {
  const base = {
    type: 'REUSABLE',
    fiatCurrency: 'USD',
    token: 'USDC',
  } as const;

  it('accepts a FIXED link with an amount', () => {
    const result = createPaymentLinkSchema.safeParse({
      ...base,
      amountMode: 'FIXED',
      amountFiat: 1999,
    });
    expect(result.success).toBe(true);
  });

  it('requires amountFiat for FIXED and forbids min/max', () => {
    expect(createPaymentLinkSchema.safeParse({ ...base, amountMode: 'FIXED' }).success).toBe(false);
    expect(
      createPaymentLinkSchema.safeParse({
        ...base,
        amountMode: 'FIXED',
        amountFiat: 1999,
        minFiat: 100,
      }).success,
    ).toBe(false);
  });

  it('forbids amountFiat for PAYER_CHOOSES and enforces min <= max', () => {
    expect(
      createPaymentLinkSchema.safeParse({
        ...base,
        amountMode: 'PAYER_CHOOSES',
        minFiat: 100,
        maxFiat: 5000,
      }).success,
    ).toBe(true);
    expect(
      createPaymentLinkSchema.safeParse({
        ...base,
        amountMode: 'PAYER_CHOOSES',
        amountFiat: 1999,
      }).success,
    ).toBe(false);
    expect(
      createPaymentLinkSchema.safeParse({
        ...base,
        amountMode: 'PAYER_CHOOSES',
        minFiat: 5000,
        maxFiat: 100,
      }).success,
    ).toBe(false);
  });

  it('rejects ONE_TIME links with maxUses > 1', () => {
    expect(
      createPaymentLinkSchema.safeParse({
        ...base,
        type: 'ONE_TIME',
        amountMode: 'FIXED',
        amountFiat: 1999,
        maxUses: 5,
      }).success,
    ).toBe(false);
  });

  it('coerces expiresAt ISO strings to Date', () => {
    const result = createPaymentLinkSchema.parse({
      ...base,
      amountMode: 'FIXED',
      amountFiat: 1999,
      expiresAt: '2026-08-01T00:00:00.000Z',
    });
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('rejects non-integer and non-positive amounts', () => {
    for (const amountFiat of [19.99, 0, -5]) {
      expect(
        createPaymentLinkSchema.safeParse({ ...base, amountMode: 'FIXED', amountFiat }).success,
        String(amountFiat),
      ).toBe(false);
    }
  });
});

describe('updatePaymentLinkSchema', () => {
  it('accepts merchant-editable statuses only', () => {
    expect(updatePaymentLinkSchema.safeParse({ status: 'PAUSED' }).success).toBe(true);
    expect(updatePaymentLinkSchema.safeParse({ status: 'COMPLETED' }).success).toBe(false);
  });

  it('rejects an empty patch', () => {
    expect(updatePaymentLinkSchema.safeParse({}).success).toBe(false);
  });
});

describe('createPaymentIntentSchema', () => {
  it('validates an API intent body', () => {
    expect(
      createPaymentIntentSchema.safeParse({
        fiatCurrency: 'JPY',
        amountFiat: 5000,
        token: 'SOL',
      }).success,
    ).toBe(true);
    expect(
      createPaymentIntentSchema.safeParse({
        fiatCurrency: 'JPY',
        amountFiat: 50.5,
        token: 'SOL',
      }).success,
    ).toBe(false);
  });
});

describe('createWebhookEndpointSchema', () => {
  it('accepts https URLs and known events, defaulting active to true', () => {
    const result = createWebhookEndpointSchema.parse({
      url: 'https://example.com/hooks',
      events: ['intent.finalized', 'intent.underpaid'],
    });
    expect(result.active).toBe(true);
  });

  it('allows plain http only for localhost', () => {
    expect(
      createWebhookEndpointSchema.safeParse({
        url: 'http://localhost:4000/hooks',
        events: ['intent.finalized'],
      }).success,
    ).toBe(true);
    expect(
      createWebhookEndpointSchema.safeParse({
        url: 'http://example.com/hooks',
        events: ['intent.finalized'],
      }).success,
    ).toBe(false);
  });

  it('rejects unknown events and empty event lists', () => {
    expect(
      createWebhookEndpointSchema.safeParse({
        url: 'https://example.com/hooks',
        events: ['intent.created'],
      }).success,
    ).toBe(false);
    expect(
      createWebhookEndpointSchema.safeParse({ url: 'https://example.com/hooks', events: [] })
        .success,
    ).toBe(false);
  });
});

describe('createApiKeySchema', () => {
  it('requires a non-empty label', () => {
    expect(createApiKeySchema.safeParse({ label: 'prod key' }).success).toBe(true);
    expect(createApiKeySchema.safeParse({ label: '   ' }).success).toBe(false);
  });
});
