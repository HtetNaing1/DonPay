import { z } from 'zod';
import { FiatCurrency, fiatMajorToMinor } from '../money';
import {
  amountModeSchema,
  linkStatusSchema,
  linkTypeSchema,
  fiatCurrencySchema,
  payTokenSchema,
} from './enums';
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

/** A payment link as returned by the API. `status` is the effective status
 *  (expiry/exhaustion already applied), not the raw stored value. */
export const paymentLinkSchema = z.object({
  id: z.string(),
  slug: z.string(),
  type: linkTypeSchema,
  amountMode: amountModeSchema,
  fiatCurrency: fiatCurrencySchema,
  amountFiat: fiatMinorAmountSchema.nullable(),
  minFiat: fiatMinorAmountSchema.nullable(),
  maxFiat: fiatMinorAmountSchema.nullable(),
  token: payTokenSchema,
  note: z.string().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  maxUses: z.int().positive().nullable(),
  useCount: z.int().nonnegative(),
  status: linkStatusSchema,
  createdAt: z.iso.datetime(),
});
export type PaymentLinkView = z.infer<typeof paymentLinkSchema>;

/**
 * Dashboard link form: amounts arrive as major-unit strings ("25.00") and
 * empty inputs as "". Validates/converts, then pipes into
 * createPaymentLinkSchema so form and API enforce identical rules.
 */
export const paymentLinkFormSchema = z
  .object({
    type: linkTypeSchema,
    amountMode: amountModeSchema,
    fiatCurrency: fiatCurrencySchema,
    token: payTokenSchema,
    amountFiat: z.string().trim(),
    minFiat: z.string().trim(),
    maxFiat: z.string().trim(),
    note: z.string().trim(),
    expiresAt: z.string(), // datetime-local value or ""
    maxUses: z.string().trim(),
  })
  .transform((form, ctx): CreatePaymentLinkInput => {
    const amountFiat = parseFiatInput(form.amountFiat, form.fiatCurrency, ctx, 'amountFiat');
    const minFiat = parseFiatInput(form.minFiat, form.fiatCurrency, ctx, 'minFiat');
    const maxFiat = parseFiatInput(form.maxFiat, form.fiatCurrency, ctx, 'maxFiat');
    const maxUses = parseMaxUses(form.maxUses, ctx);
    const candidate = {
      type: form.type,
      amountMode: form.amountMode,
      fiatCurrency: form.fiatCurrency,
      token: form.token,
      ...(amountFiat !== undefined && { amountFiat }),
      ...(minFiat !== undefined && { minFiat }),
      ...(maxFiat !== undefined && { maxFiat }),
      ...(form.note !== '' && { note: form.note }),
      ...(form.expiresAt !== '' && { expiresAt: new Date(form.expiresAt) }),
      ...(maxUses !== undefined && { maxUses }),
    };
    // Same rules as the API: run the canonical schema and forward its issues.
    const result = createPaymentLinkSchema.safeParse(candidate);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.issues.push({
          code: 'custom',
          path: issue.path,
          message: issue.message,
          input: candidate,
        });
      }
      return z.NEVER;
    }
    return result.data;
  });
export type PaymentLinkFormInput = z.input<typeof paymentLinkFormSchema>;

function parseFiatInput(
  value: string,
  currency: FiatCurrency,
  ctx: z.core.ParsePayload<unknown>,
  field: string,
): number | undefined {
  if (value === '') return undefined;
  try {
    const minor = fiatMajorToMinor(value, currency);
    if (minor <= 0) throw new Error('must be positive');
    return minor;
  } catch {
    ctx.issues.push({
      code: 'custom',
      path: [field],
      message: `Enter a valid ${currency} amount`,
      input: value,
    });
    return undefined;
  }
}

function parseMaxUses(
  value: string,
  ctx: z.core.ParsePayload<unknown>,
): number | undefined {
  if (value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    ctx.issues.push({
      code: 'custom',
      path: ['maxUses'],
      message: 'Enter a whole number of uses',
      input: value,
    });
    return undefined;
  }
  return parsed;
}
