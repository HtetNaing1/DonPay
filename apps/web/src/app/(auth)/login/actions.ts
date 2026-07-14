'use server';

import type { IssuedNonce } from '@donpay/shared';
import { apiUrl, readProblem } from '@/lib/api';
import type { ApiResult } from '@/lib/api-server';

/**
 * Pre-auth nonce for wallet login — no session yet, so this calls the API
 * directly instead of going through merchantApiFetch.
 */
export async function requestLoginNonce(
  address: string,
): Promise<ApiResult<IssuedNonce>> {
  const query = new URLSearchParams({ address, purpose: 'WALLET_LOGIN' });
  const response = await fetch(apiUrl(`/auth/nonce?${query}`), {
    cache: 'no-store',
  });
  if (!response.ok) {
    return { ok: false, problem: await readProblem(response) };
  }
  return { ok: true, data: (await response.json()) as IssuedNonce };
}
