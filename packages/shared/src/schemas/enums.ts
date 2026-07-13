import { z } from 'zod';
import { FIAT_CURRENCIES, PAY_TOKENS } from '../money';

// Enum values mirror apps/api/prisma/schema.prisma — keep the two in sync.

export const chainSchema = z.enum(['SOLANA']);
export type Chain = z.infer<typeof chainSchema>;

export const payTokenSchema = z.enum(PAY_TOKENS);
export const fiatCurrencySchema = z.enum(FIAT_CURRENCIES);

export const linkTypeSchema = z.enum(['ONE_TIME', 'REUSABLE']);
export type LinkType = z.infer<typeof linkTypeSchema>;

export const amountModeSchema = z.enum(['FIXED', 'PAYER_CHOOSES']);
export type AmountMode = z.infer<typeof amountModeSchema>;

export const linkStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'EXPIRED']);
export type LinkStatus = z.infer<typeof linkStatusSchema>;

export const INTENT_STATUSES = [
  'CREATED',
  'PENDING',
  'DETECTED',
  'CONFIRMED',
  'FINALIZED',
  'EXPIRED',
  'UNDERPAID',
  'LATE_PAYMENT',
] as const;
export const intentStatusSchema = z.enum(INTENT_STATUSES);
export type IntentStatus = z.infer<typeof intentStatusSchema>;

export const intentFlagSchema = z.enum(['OVERPAID', 'DUPLICATE_PAYMENT']);
export type IntentFlag = z.infer<typeof intentFlagSchema>;

export const webhookDeliveryStatusSchema = z.enum([
  'PENDING',
  'DELIVERED',
  'FAILED',
  'DEAD',
]);
export type WebhookDeliveryStatus = z.infer<typeof webhookDeliveryStatusSchema>;

export const noncePurposeSchema = z.enum(['WALLET_VERIFY', 'WALLET_LOGIN']);
export type NoncePurpose = z.infer<typeof noncePurposeSchema>;
