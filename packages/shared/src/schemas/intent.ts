import { z } from 'zod';
import { fiatCurrencySchema, payTokenSchema } from './enums';
import { fiatMinorAmountSchema } from './primitives';

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
