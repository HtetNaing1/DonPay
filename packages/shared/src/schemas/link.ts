import { z } from 'zod';
import { amountModeSchema, linkTypeSchema, fiatCurrencySchema, payTokenSchema } from './enums';
import { fiatMinorAmountSchema } from './primitives';

export const createPaymentLinkSchema = z
  .object({
    type: linkTypeSchema,
    amountMode: amountModeSchema,
    fiatCurrency: fiatCurrencySchema,
    amountFiat: fiatMinorAmountSchema.optional(),
    minFiat: fiatMinorAmountSchema.optional(),
    maxFiat: fiatMinorAmountSchema.optional(),
    token: payTokenSchema,
    note: z.string().trim().max(500).optional(),
    expiresAt: z.coerce.date().optional(),
    maxUses: z.int().positive().optional(),
  })
  .superRefine((link, ctx) => {
    if (link.amountMode === 'FIXED') {
      if (link.amountFiat === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['amountFiat'],
          message: 'amountFiat is required when amountMode is FIXED',
        });
      }
      if (link.minFiat !== undefined || link.maxFiat !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['minFiat'],
          message: 'minFiat/maxFiat are only allowed when amountMode is PAYER_CHOOSES',
        });
      }
    } else {
      if (link.amountFiat !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['amountFiat'],
          message: 'amountFiat is only allowed when amountMode is FIXED',
        });
      }
      if (
        link.minFiat !== undefined &&
        link.maxFiat !== undefined &&
        link.minFiat > link.maxFiat
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['maxFiat'],
          message: 'maxFiat must be greater than or equal to minFiat',
        });
      }
    }
    if (link.type === 'ONE_TIME' && link.maxUses !== undefined && link.maxUses !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxUses'],
        message: 'ONE_TIME links cannot have maxUses other than 1',
      });
    }
  });
export type CreatePaymentLinkInput = z.infer<typeof createPaymentLinkSchema>;

/** Merchant-editable fields; COMPLETED/EXPIRED are set by the system only. */
export const updatePaymentLinkSchema = z
  .object({
    status: z.enum(['ACTIVE', 'PAUSED']).optional(),
    note: z.string().trim().max(500).optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    maxUses: z.int().positive().nullable().optional(),
  })
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });
export type UpdatePaymentLinkInput = z.infer<typeof updatePaymentLinkSchema>;
