import { z } from 'zod';

/** One event per intent state a merchant can subscribe to (fired on transition
 *  into it), plus the flag-only duplicate-payment notice on finalized intents. */
export const WEBHOOK_EVENTS = [
  'intent.pending',
  'intent.detected',
  'intent.confirmed',
  'intent.finalized',
  'intent.expired',
  'intent.underpaid',
  'intent.late_payment',
  'intent.duplicate_payment',
] as const;
export const webhookEventSchema = z.enum(WEBHOOK_EVENTS);
export type WebhookEvent = z.infer<typeof webhookEventSchema>;

const httpsOrLocalhost = (url: string) => {
  const { protocol, hostname } = new URL(url);
  return (
    protocol === 'https:' ||
    (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1'))
  );
};

export const createWebhookEndpointSchema = z.object({
  url: z
    .url()
    .refine(httpsOrLocalhost, 'Webhook URLs must use https (http allowed for localhost only)'),
  events: z.array(webhookEventSchema).min(1),
  active: z.boolean().default(true),
});
export type CreateWebhookEndpointInput = z.infer<typeof createWebhookEndpointSchema>;

/** An endpoint as listed in the dashboard — the secret is never in here. */
export const webhookEndpointSchema = z.object({
  id: z.string(),
  url: z.string(),
  events: z.array(webhookEventSchema),
  active: z.boolean(),
});
export type WebhookEndpointView = z.infer<typeof webhookEndpointSchema>;

/** Creation response: the one and only time the signing secret is shown. */
export const createdWebhookEndpointSchema = webhookEndpointSchema.extend({
  secret: z.string(),
});
export type CreatedWebhookEndpoint = z.infer<typeof createdWebhookEndpointSchema>;

export const webhookDeliverySchema = z.object({
  id: z.string(),
  intentId: z.string(),
  event: webhookEventSchema,
  status: z.enum(['PENDING', 'DELIVERED', 'FAILED', 'DEAD']),
  attempts: z.int().nonnegative(),
  lastResponseCode: z.int().nullable(),
  nextAttemptAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type WebhookDeliveryView = z.infer<typeof webhookDeliverySchema>;

export const updateWebhookEndpointSchema = z
  .object({
    url: z
      .url()
      .refine(httpsOrLocalhost, 'Webhook URLs must use https (http allowed for localhost only)')
      .optional(),
    events: z.array(webhookEventSchema).min(1).optional(),
    active: z.boolean().optional(),
  })
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });
export type UpdateWebhookEndpointInput = z.infer<typeof updateWebhookEndpointSchema>;
