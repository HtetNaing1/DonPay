import { Inject, Injectable } from '@nestjs/common';
import { PaymentIntentView, WebhookEvent } from '@donpay/shared';
import { Clock, CLOCK } from '../common/clock';
import { Prisma } from '../generated/prisma/client';

export interface OutboxEntry {
  merchantId: string;
  intentId: string;
  event: WebhookEvent;
  intent: PaymentIntentView;
}

/**
 * The write side of the outbox (rule 3): called by transition() INSIDE its
 * transaction, so the delivery rows commit or roll back with the status
 * change — a webhook can never fire for a transition that didn't happen,
 * and no transition can silently drop its webhooks. Delivery is the
 * dispatcher's job; nothing is sent inline, ever.
 */
@Injectable()
export class WebhookOutboxService {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  async enqueue(
    tx: Prisma.TransactionClient,
    entry: OutboxEntry,
  ): Promise<void> {
    const endpoints = await tx.webhookEndpoint.findMany({
      where: {
        merchantId: entry.merchantId,
        active: true,
        // empty events array = subscribed to everything
        OR: [{ events: { isEmpty: true } }, { events: { has: entry.event } }],
      },
      select: { id: true },
    });
    if (endpoints.length === 0) return;

    // payload is snapshotted at transition time — what the merchant is told
    // is what was true when it happened, even if the intent moves on
    const payload = {
      event: entry.event,
      occurredAt: this.clock.now().toISOString(),
      data: entry.intent,
    } as unknown as Prisma.InputJsonValue;

    await tx.webhookDelivery.createMany({
      data: endpoints.map((endpoint) => ({
        endpointId: endpoint.id,
        intentId: entry.intentId,
        event: entry.event,
        payload,
        nextAttemptAt: this.clock.now(), // due immediately
      })),
    });
  }
}
