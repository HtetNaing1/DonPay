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
    // Find work: rows that are due. "Due" = status is PENDING (never tried, or
    // re-queued) or FAILED (failed but has retries left), AND nextAttemptAt is
    // in the past (`lte` now). DELIVERED and DEAD rows are terminal and skipped.
    // The [status, nextAttemptAt] DB index exists precisely for this query.
    const due = await this.prisma.webhookDelivery.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        nextAttemptAt: { lte: this.clock.now() },
      },
      // `include: { endpoint: true }` eager-loads the parent endpoint (a JOIN)
      // so we have its url + secret without a second query per row.
      include: { endpoint: true },
      // Oldest-due first (fairness), and take 20 to bound each sweep's work —
      // a backlog drains over several sweeps instead of one giant burst.
      orderBy: { nextAttemptAt: 'asc' },
      take: 20,
    });
    // Sequential await: deliver one at a time. Simple and gentle on the DB;
    // throughput comes from sweeping often (see WebhookWorker), not concurrency.
    for (const delivery of due) {
      await this.deliver(delivery);
    }
    return due.length;
  }

  private async deliver(delivery: DueDelivery): Promise<void> {
    // Optimistic concurrency control. If two dispatcher processes (or two
    // sweeps) grab the same row, only one should send it. We conditionally
    // increment attempts WHERE the attempts value still equals what we read.
    // The DB serializes the two updates: the first flips attempts 0->1 and
    // matches; the second's `where attempts = 0` now matches nothing (it's 1),
    // so its count is 0 and it bails. No locks needed — the row's own value is
    // the guard. This is why the counter is bumped BEFORE the HTTP call.
    const claimed = await this.prisma.webhookDelivery.updateMany({
      where: { id: delivery.id, attempts: delivery.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return; // another sweeper took this attempt

    const attempt = delivery.attempts + 1;
    // The signed payload must be the EXACT bytes we hash and send — serialize
    // once, reuse for both the signature and the request body.
    const body = JSON.stringify(delivery.payload);
    // Unix seconds; goes into the signature so receivers can reject stale/replayed deliveries.
    const timestamp = Math.floor(this.clock.now().getTime() / 1000);

    // Two ways a delivery can fail: the request throws (DNS/timeout/refused) —
    // caught below — or it completes with a non-2xx status. We track both in
    // `failure` (null means success) and `responseCode` (null if no response).
    let responseCode: number | null = null;
    let failure: string | null = null;
    try {
      const response = await fetch(delivery.endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // The signature the receiver verifies with their endpoint secret.
          'donpay-signature': signWebhook(
            delivery.endpoint.secret,
            timestamp,
            body,
          ),
          'donpay-event': delivery.event,
          // Stable per-delivery id so receivers can dedupe: the same delivery
          // may legitimately arrive twice (a retry after a timeout that
          // actually succeeded), and this header lets them ignore the double.
          'donpay-delivery': delivery.id,
        },
        body,
        // Hard timeout so a hung receiver can't stall the whole sweep.
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      responseCode = response.status;
      // response.ok is true only for 2xx. Anything else is a failure we'll retry.
      if (!response.ok) failure = `HTTP ${response.status}`;
    } catch (error) {
      failure = String(error);
    }

    // --- Success path ---
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

    // --- Failure path ---
    // Out of retries? Once we've used maxAttempts, the row is dead-lettered:
    // status DEAD, no further nextAttemptAt, so the dispatcher ignores it
    // forever (a human can still redeliver it from the dashboard).
    const dead = attempt >= this.maxAttempts;
    await this.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: dead ? 'DEAD' : 'FAILED',
        lastResponseCode: responseCode,
        // Exponential backoff: base * 4^(attempt-1) gives 30s, 2m, 8m, 32m …
        // Each retry waits 4x longer, so a persistently-down endpoint is probed
        // rarely instead of hammered. Dead rows keep no next attempt (null).
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
