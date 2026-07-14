'use server';

import { revalidatePath } from 'next/cache';
import type { CreatePaymentLinkInput, PaymentLinkView } from '@donpay/shared';
import { ApiResult, merchantApiFetch } from '@/lib/api-server';

export async function createPaymentLink(
  input: CreatePaymentLinkInput,
): Promise<ApiResult<PaymentLinkView>> {
  const result = await merchantApiFetch<PaymentLinkView>('/merchants/me/links', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (result.ok) {
    revalidatePath('/dashboard/links');
  }
  return result;
}

/** Succeeds only for links with no payment history (the API enforces it). */
export async function deletePaymentLink(linkId: string): Promise<void> {
  await merchantApiFetch<undefined>(`/merchants/me/links/${linkId}`, {
    method: 'DELETE',
  });
  revalidatePath('/dashboard/links');
}

export async function setLinkStatus(
  linkId: string,
  status: 'ACTIVE' | 'PAUSED',
): Promise<void> {
  await merchantApiFetch<PaymentLinkView>(`/merchants/me/links/${linkId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  revalidatePath('/dashboard/links');
}
