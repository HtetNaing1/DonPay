import { z } from 'zod';

export const createApiKeySchema = z.object({
  label: z.string().trim().min(1).max(100),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

/** An API key as listed in the dashboard — the secret is never included. */
export const apiKeySummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  prefix: z.string(),
  createdAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});
export type ApiKeySummary = z.infer<typeof apiKeySummarySchema>;

/** Creation response — the only time the full key is ever returned. */
export const createdApiKeySchema = apiKeySummarySchema.extend({
  key: z.string(),
});
export type CreatedApiKey = z.infer<typeof createdApiKeySchema>;
