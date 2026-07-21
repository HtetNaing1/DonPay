'use server';

import { revalidatePath } from 'next/cache';
import type {
  CreatedWebhookEndpoint,
  CreateWebhookEndpointInput,
  WebhookDeliveryView,
  WebhookEndpointView,
} from '@donpay/shared';
import { ApiResult, merchantApiFetch } from '@/lib/api-server';

/** The response carries the signing secret — the only time it is shown. */
export async function createWebhookEndpoint(
  input: CreateWebhookEndpointInput,
): Promise<ApiResult<CreatedWebhookEndpoint>> {
  const result = await merchantApiFetch<CreatedWebhookEndpoint>('/merchants/me/webhooks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (result.ok) {
    revalidatePath('/dashboard/webhooks');
  }
  return result;
}

/** Pause or resume delivery to an endpoint (usable directly as a form action). */
export async function setWebhookActive(
  endpointId: string,
  active: boolean,
): Promise<void> {
  await merchantApiFetch<WebhookEndpointView>(`/merchants/me/webhooks/${endpointId}`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  });
  revalidatePath('/dashboard/webhooks');
}

export async function deleteWebhookEndpoint(endpointId: string): Promise<void> {
  await merchantApiFetch<undefined>(`/merchants/me/webhooks/${endpointId}`, {
    method: 'DELETE',
  });
  revalidatePath('/dashboard/webhooks');
}

/** Latest deliveries for one endpoint — loaded on demand when a log opens. */
export async function listWebhookDeliveries(
  endpointId: string,
): Promise<ApiResult<WebhookDeliveryView[]>> {
  return merchantApiFetch<WebhookDeliveryView[]>(
    `/merchants/me/webhooks/${endpointId}/deliveries`,
  );
}

/** Queue one fresh attempt; the dispatcher sends it on its next sweep. */
export async function redeliverWebhook(
  deliveryId: string,
): Promise<ApiResult<WebhookDeliveryView>> {
  return merchantApiFetch<WebhookDeliveryView>(
    `/merchants/me/webhooks/deliveries/${deliveryId}/redeliver`,
    { method: 'POST' },
  );
}
