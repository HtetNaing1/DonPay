import { z } from 'zod';
import {
  fiatCurrencySchema,
  intentFlagSchema,
  intentStatusSchema,
  payTokenSchema,
} from './enums';
import { fiatMinorAmountSchema, solanaAddressSchema } from './primitives';

/** Body of `POST /v1/payment-intents` (API-key auth, Idempotency-Key header). */
export const createPaymentIntentSchema = z.object({
  fiatCurrency: fiatCurrencySchema,
  /** Fiat amount in minor units (cents / JPY as-is). */
  amountFiat: fiatMinorAmountSchema,
  token: payTokenSchema,
  note: z.string().trim().max(500).optional(),
});
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;

/** Body of the public link-open flow (`/pay/[slug]`); amount only for PAYER_CHOOSES links. */
export const openLinkIntentSchema = z.object({
  amountFiat: fiatMinorAmountSchema.optional(),
});
export type OpenLinkIntentInput = z.infer<typeof openLinkIntentSchema>;

/**
 * A payment intent as returned by the API. Token amounts are minor-unit
 * integers serialized as strings (BigInt has no JSON representation); the
 * rate is the locked price of 1 whole token in fiat major units.
 */
export const paymentIntentSchema = z.object({
  id: z.string(),
  linkId: z.string().nullable(),
  /** Per-intent reference key the chain watcher matches on. */
  reference: solanaAddressSchema,
  fiatCurrency: fiatCurrencySchema,
  amountFiat: fiatMinorAmountSchema,
  token: payTokenSchema,
  /** Token amount in minor units (lamports / USDC micro-units), as a string. */
  amountToken: z.string().regex(/^\d+$/),
  rate: z.string(),
  rateSource: z.string(),
  quoteExpiresAt: z.iso.datetime(),
  payoutAddress: solanaAddressSchema,
  status: intentStatusSchema,
  flags: z.array(intentFlagSchema),
  note: z.string().nullable(),
  checkoutUrl: z.url(),
  createdAt: z.iso.datetime(),
});
export type PaymentIntentView = z.infer<typeof paymentIntentSchema>;
