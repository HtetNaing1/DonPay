'use server';

import { revalidatePath } from 'next/cache';
import type {
  ApiKeySummary,
  CreateApiKeyInput,
  CreatedApiKey,
} from '@donpay/shared';
import { ApiResult, merchantApiFetch } from '@/lib/api-server';

/** The response carries the full key — the only time it ever leaves the API. */
export async function createApiKey(
  input: CreateApiKeyInput,
): Promise<ApiResult<CreatedApiKey>> {
  const result = await merchantApiFetch<CreatedApiKey>(
    '/merchants/me/api-keys',
    { method: 'POST', body: JSON.stringify(input) },
  );
  if (result.ok) {
    revalidatePath('/dashboard/api-keys');
  }
  return result;
}

export async function revokeApiKey(keyId: string): Promise<void> {
  await merchantApiFetch<ApiKeySummary>(`/merchants/me/api-keys/${keyId}`, {
    method: 'DELETE',
  });
  revalidatePath('/dashboard/api-keys');
}
