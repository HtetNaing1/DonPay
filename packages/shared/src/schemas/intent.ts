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
  /** Chain payment URI (Solana Pay) — render as QR or wallet deep link. */
  paymentUrl: z.string(),
  createdAt: z.iso.datetime(),
});
export type PaymentIntentView = z.infer<typeof paymentIntentSchema>;

/** One row in the merchant's dashboard payments list (session auth). */
export const intentSummarySchema = z.object({
  id: z.string(),
  reference: solanaAddressSchema,
  status: intentStatusSchema,
  flags: z.array(intentFlagSchema),
  fiatCurrency: fiatCurrencySchema,
  amountFiat: fiatMinorAmountSchema,
  token: payTokenSchema,
  amountToken: z.string().regex(/^\d+$/),
  linkId: z.string().nullable(),
  /** Slug of the link the intent opened from, if any — for the "Link" column. */
  linkSlug: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type IntentSummary = z.infer<typeof intentSummarySchema>;

/** Query params for the dashboard payments list — narrow by state and/or link. */
export const listIntentsQuerySchema = z.object({
  status: intentStatusSchema.optional(),
  linkId: z.string().optional(),
});
export type ListIntentsQuery = z.infer<typeof listIntentsQuerySchema>;

/** One audit row from the state machine — the detail page's timeline. */
export const intentTransitionSchema = z.object({
  fromStatus: intentStatusSchema,
  toStatus: intentStatusSchema,
  /** The event that drove the transition (e.g. PAYMENT_DETECTED). */
  event: z.string(),
  at: z.iso.datetime(),
});
export type IntentTransitionView = z.infer<typeof intentTransitionSchema>;

/** An on-chain transfer the watcher matched to the intent. */
export const onchainPaymentSchema = z.object({
  txSignature: z.string(),
  amountToken: z.string().regex(/^\d+$/),
  payerAddress: solanaAddressSchema,
  slot: z.string(),
  detectedAt: z.iso.datetime(),
  finalizedAt: z.iso.datetime().nullable(),
});
export type OnchainPaymentView = z.infer<typeof onchainPaymentSchema>;

/** A single intent for the merchant's dashboard — the full ticket plus its
 *  audit timeline and any on-chain payments seen. Session auth, merchant-scoped. */
export const intentDetailSchema = paymentIntentSchema.extend({
  linkSlug: z.string().nullable(),
  transitions: z.array(intentTransitionSchema),
  payments: z.array(onchainPaymentSchema),
});
export type IntentDetail = z.infer<typeof intentDetailSchema>;

/**
 * What the public checkout page renders — no auth, addressed by unguessable
 * intent id. Superset of the ticket: who is being paid, the live state
 * timeline (real transition timestamps), and any on-chain payments seen.
 */
export const checkoutIntentSchema = z.object({
  id: z.string(),
  status: intentStatusSchema,
  flags: z.array(intentFlagSchema),
  merchantName: z.string(),
  fiatCurrency: fiatCurrencySchema,
  amountFiat: fiatMinorAmountSchema,
  token: payTokenSchema,
  amountToken: z.string().regex(/^\d+$/),
  paymentUrl: z.string(),
  payoutAddress: solanaAddressSchema,
  reference: solanaAddressSchema,
  note: z.string().nullable(),
  /** Present when the intent came from a payment link — checkout can restart there. */
  linkSlug: z.string().nullable(),
  quoteExpiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  transitions: z.array(
    z.object({ status: intentStatusSchema, at: z.iso.datetime() }),
  ),
  payments: z.array(
    z.object({ txSignature: z.string(), amountToken: z.string() }),
  ),
});
export type CheckoutIntent = z.infer<typeof checkoutIntentSchema>;
