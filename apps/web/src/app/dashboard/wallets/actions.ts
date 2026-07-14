'use server';

import { revalidatePath } from 'next/cache';
import type {
  IssuedNonce,
  MerchantWallet,
  WalletVerifyInput,
} from '@donpay/shared';
import { ApiResult, merchantApiFetch } from '@/lib/api-server';

/** Challenge for the connected wallet — the panel signs `messageText` client-side. */
export async function requestWalletNonce(
  address: string,
): Promise<ApiResult<IssuedNonce>> {
  const query = new URLSearchParams({ address, purpose: 'WALLET_VERIFY' });
  return merchantApiFetch<IssuedNonce>(`/auth/nonce?${query}`);
}

export async function verifyPayoutWallet(
  input: WalletVerifyInput,
): Promise<ApiResult<MerchantWallet>> {
  const result = await merchantApiFetch<MerchantWallet>(
    '/merchants/me/wallets/verify',
    { method: 'POST', body: JSON.stringify(input) },
  );
  if (result.ok) {
    revalidatePath('/dashboard/wallets');
    revalidatePath('/dashboard');
  }
  return result;
}

export async function setDefaultWallet(walletId: string): Promise<void> {
  await merchantApiFetch<MerchantWallet>(
    `/merchants/me/wallets/${walletId}/default`,
    { method: 'PATCH' },
  );
  revalidatePath('/dashboard/wallets');
}
