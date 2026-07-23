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
    // The key detail of the whole pattern: this takes a `tx` (a transaction
    // client), not the normal `this.prisma`. The caller — transition() — passes
    // its OWN open transaction in, so the delivery rows written here are part of
    // the SAME atomic unit as the status change. Either both commit or neither
    // does. That is what "outbox" buys you: the intent to send is stored in the
    // same DB write that made the state change true, so it can't be lost and
    // can't fire for a change that rolled back.
    tx: Prisma.TransactionClient,
    entry: OutboxEntry,
  ): Promise<void> {
    // Find which of this merchant's endpoints should hear about this event.
    const endpoints = await tx.webhookEndpoint.findMany({
      where: {
        merchantId: entry.merchantId,
        active: true,
        // `OR`: match endpoints subscribed to everything (empty events list) OR
        // to this specific event. `has` = "array column contains this value".
        OR: [{ events: { isEmpty: true } }, { events: { has: entry.event } }],
      },
      select: { id: true },
    });
    // No subscribers → nothing to enqueue. Cheap early exit.
    if (endpoints.length === 0) return;

    // The payload is snapshotted NOW, at transition time. We freeze what was
    // true when the event happened, so a webhook delivered minutes later (after
    // retries) still describes the intent as it was at that moment — not its
    // current, possibly-advanced state.
    const payload = {
      event: entry.event,
      occurredAt: this.clock.now().toISOString(),
      data: entry.intent,
    } as unknown as Prisma.InputJsonValue;

    // One delivery row per subscribed endpoint (fan-out). createMany is a single
    // bulk INSERT. Each starts life PENDING (the schema default) and due now, so
    // the dispatcher will pick them up on its very next sweep.
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
