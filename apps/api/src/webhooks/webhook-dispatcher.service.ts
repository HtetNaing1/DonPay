import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock, CLOCK } from '../common/clock';
import { Env } from '../config/env';
import { WebhookDelivery, WebhookEndpoint } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { signWebhook } from './signature';

type DueDelivery = WebhookDelivery & { endpoint: WebhookEndpoint };

/**
 * The read side of the outbox: sweeps due PENDING/FAILED rows (the
 * [status, nextAttemptAt] index exists for exactly this), signs and posts
 * each, and applies the retry policy — exponential backoff over
 * WEBHOOK_MAX_ATTEMPTS, then DEAD (rule 3). The DB is the queue, so a
 * dispatcher restart loses nothing; an optimistic claim on the attempts
 * counter keeps two sweepers from double-sending the same attempt.
 * Runs only in the worker process.
 */
@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    this.timeoutMs = config.get('WEBHOOK_TIMEOUT_MS', { infer: true });
    this.maxAttempts = config.get('WEBHOOK_MAX_ATTEMPTS', { infer: true });
    this.backoffBaseMs = config.get('WEBHOOK_BACKOFF_BASE_MS', { infer: true });
  }

  /** One sweep. Returns how many deliveries were attempted (for tests/logs). */
  async tick(): Promise<number> {
    const due = await this.prisma.webhookDelivery.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        nextAttemptAt: { lte: this.clock.now() },
      },
      include: { endpoint: true },
      orderBy: { nextAttemptAt: 'asc' },
      take: 20,
    });
    for (const delivery of due) {
      await this.deliver(delivery);
    }
    return due.length;
  }

  private async deliver(delivery: DueDelivery): Promise<void> {
    // optimistic claim: bump attempts only if nobody else already did
    const claimed = await this.prisma.webhookDelivery.updateMany({
      where: { id: delivery.id, attempts: delivery.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return; // another sweeper took this attempt

    const attempt = delivery.attempts + 1;
    const body = JSON.stringify(delivery.payload);
    const timestamp = Math.floor(this.clock.now().getTime() / 1000);

    let responseCode: number | null = null;
    let failure: string | null = null;
    try {
      const response = await fetch(delivery.endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'donpay-signature': signWebhook(
            delivery.endpoint.secret,
            timestamp,
            body,
          ),
          'donpay-event': delivery.event,
          'donpay-delivery': delivery.id, // receivers dedupe on this
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      responseCode = response.status;
      if (!response.ok) failure = `HTTP ${response.status}`;
    } catch (error) {
      failure = String(error);
    }

    if (failure === null) {
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'DELIVERED',
          lastResponseCode: responseCode,
          nextAttemptAt: null,
        },
      });
      return;
    }

    const dead = attempt >= this.maxAttempts;
    await this.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: dead ? 'DEAD' : 'FAILED',
        lastResponseCode: responseCode,
        // 30s, 2m, 8m, 32m … — dead rows keep no next attempt
        nextAttemptAt: dead
          ? null
          : new Date(
              this.clock.now().getTime() +
                this.backoffBaseMs * 4 ** (attempt - 1),
            ),
      },
    });
    this.logger.warn(
      `delivery ${delivery.id} attempt ${attempt}/${this.maxAttempts} failed (${failure})${dead ? ' — dead-lettered' : ''}`,
    );
  }
}
