import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { classifyPaymentAmount, PayToken } from '@donpay/shared';
import { Clock, CLOCK } from '../common/clock';
import { Env } from '../config/env';
import { OnchainPayment, PaymentIntent } from '../generated/prisma/client';
import { PaymentIntentService } from '../intents/payment-intent.service';
import { TransitionConflictError } from '../intents/state-machine';
import { PrismaService } from '../prisma/prisma.service';
import { WatchJobData } from '../queues/watch-job';
import { WatchQueueService } from '../queues/watch-queue.service';
import { ChainAdapter, CHAIN_ADAPTER, ChainPayment } from './chain-adapter';

/** What a tick decides for the watch: keep going at a cadence, or stop. */
interface NextTick {
  mode: WatchJobData['mode'];
  delayMs: number;
}

/**
 * The chain watcher: each tick reads the intent's current status (the row is
 * the truth — job data only carries cadence), asks the ChainAdapter what the
 * chain says, and feeds events into PaymentIntentService.transition(). It
 * never writes status itself (rule 2). Ticks self-reschedule via the queue;
 * RPC errors back off exponentially instead of killing the watch, and
 * transition conflicts (a racing tick or expiry) are treated as benign —
 * re-read next tick. Runs only in the worker process.
 */
@Injectable()
export class ChainWatcherService {
  private readonly logger = new Logger(ChainWatcherService.name);
  private readonly pollMs: number;
  private readonly tailPollMs: number;
  private readonly tailMs: number;
  private readonly maxBackoffMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly intents: PaymentIntentService,
    private readonly watchQueue: WatchQueueService,
    @Inject(CHAIN_ADAPTER) private readonly adapter: ChainAdapter,
    @Inject(CLOCK) private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    this.pollMs = config.get('WATCH_POLL_MS', { infer: true });
    this.tailPollMs = config.get('WATCH_TAIL_POLL_MS', { infer: true });
    this.tailMs =
      config.get('WATCH_TAIL_HOURS', { infer: true }) * 60 * 60 * 1000;
    this.maxBackoffMs = config.get('WATCH_MAX_BACKOFF_MS', { infer: true });
  }

  /** BullMQ handler. Never throws — a watch must not die on transient errors. */
  async tick(data: WatchJobData): Promise<void> {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: data.intentId },
    });
    if (!intent) {
      // rolled-back creation or deleted row — nothing to watch
      return;
    }

    try {
      const next = await this.step(intent);
      if (next) {
        await this.watchQueue.schedule(
          { intentId: intent.id, mode: next.mode, errorCount: 0 },
          next.delayMs,
        );
      }
    } catch (error) {
      if (error instanceof TransitionConflictError) {
        // benign lost race (concurrent tick / expiry) — re-read next tick
        await this.watchQueue.schedule(
          { ...data, errorCount: 0 },
          this.cadence(data.mode),
        );
        return;
      }
      const errorCount = data.errorCount + 1;
      const delayMs = Math.min(
        this.cadence(data.mode) * 2 ** errorCount,
        this.maxBackoffMs,
      );
      this.logger.warn(
        `watch tick failed for intent ${intent.id} (attempt ${errorCount}), retrying in ${delayMs}ms: ${String(error)}`,
      );
      await this.watchQueue.schedule({ ...data, errorCount }, delayMs);
    }
  }

  /**
   * One state-driven step: dispatch to the handler for the intent's current
   * status. Each handler asks the chain what it needs, feeds events into
   * transition(), and returns the next cadence (or null to stop the watch).
   * UNDERPAID / LATE_PAYMENT are terminal — no handler, nothing to watch.
   */
  private step(intent: PaymentIntent): Promise<NextTick | null> {
    switch (intent.status) {
      case 'CREATED':
        return this.stepCreated(intent);
      case 'PENDING':
        return this.stepPending(intent);
      case 'DETECTED':
        return this.stepDetected(intent);
      case 'CONFIRMED':
        return this.stepConfirmed(intent);
      case 'EXPIRED':
        return this.stepExpired(intent);
      case 'FINALIZED':
        return this.stepFinalized(intent);
      default:
        return Promise.resolve(null);
    }
  }

  /** First tick after creation (also covers a crash before this transition). */
  private async stepCreated(intent: PaymentIntent): Promise<NextTick | null> {
    await this.intents.transition(intent.id, { type: 'WATCH_STARTED' });
    return this.active();
  }

  /** Awaiting payment: detect the first matching tx, or expire the quote. */
  private async stepPending(intent: PaymentIntent): Promise<NextTick | null> {
    const payments = await this.findPayments(intent);
    if (payments.length > 0) {
      await this.recordPayment(intent.id, payments[0]!);
      await this.intents.transition(intent.id, { type: 'PAYMENT_DETECTED' });
      return this.active();
    }
    if (intent.quoteExpiresAt <= this.clock.now()) {
      await this.intents.transition(intent.id, { type: 'QUOTE_EXPIRED' });
      return this.tail();
    }
    return this.active();
  }

  /** Payment seen: verify the amount, then wait for chain confirmation. */
  private async stepDetected(intent: PaymentIntent): Promise<NextTick | null> {
    const payment = await this.firstRecordedPayment(intent.id);
    if (!payment) {
      this.logger.warn(
        `intent ${intent.id} is DETECTED but has no recorded payment — repolling`,
      );
      return this.active();
    }
    if (
      classifyPaymentAmount(intent.amountToken, payment.amountToken) ===
      'UNDERPAID'
    ) {
      await this.intents.transition(intent.id, { type: 'PAYMENT_UNDERPAID' });
      return null; // terminal — merchant notified via the transition
    }
    const finality = await this.adapter.getFinality(payment.txSignature);
    if (finality === 'CONFIRMED' || finality === 'FINALIZED') {
      await this.intents.transition(intent.id, { type: 'PAYMENT_CONFIRMED' });
    }
    return this.active();
  }

  /** Confirmed: wait for finality, then finalize (flagging overpayment). */
  private async stepConfirmed(intent: PaymentIntent): Promise<NextTick | null> {
    const payment = await this.firstRecordedPayment(intent.id);
    if (!payment) return this.active();
    const finality = await this.adapter.getFinality(payment.txSignature);
    if (finality !== 'FINALIZED') return this.active();
    const overpaid =
      classifyPaymentAmount(intent.amountToken, payment.amountToken) ===
      'OVERPAID';
    await this.intents.transition(intent.id, {
      type: 'PAYMENT_FINALIZED',
      overpaid,
    });
    await this.prisma.onchainPayment.update({
      where: { id: payment.id },
      data: { finalizedAt: this.clock.now() },
    });
    return this.tail(); // paid — now tail-watch for duplicate payments (FR-12)
  }

  /** Expired: the 24h tail may still catch a LATE_PAYMENT before it closes. */
  private async stepExpired(intent: PaymentIntent): Promise<NextTick | null> {
    const payments = await this.findPayments(intent);
    if (payments.length > 0) {
      await this.recordPayment(intent.id, payments[0]!);
      await this.intents.transition(intent.id, {
        type: 'LATE_PAYMENT_DETECTED',
      });
      return null; // terminal — flagged for merchant action, never dropped
    }
    if (this.tailOver(intent)) return null; // 24h tail watch is over
    return this.tail();
  }

  /** Paid: tail-watch for a second on-chain payment (double scan) to flag. */
  private async stepFinalized(intent: PaymentIntent): Promise<NextTick | null> {
    // A second payment on an already-paid intent (double scan / wallet
    // retry) is real money on-chain — record and flag it, never drop it.
    if (this.tailOver(intent)) return null;
    const payments = await this.findPayments(intent);
    const known = await this.prisma.onchainPayment.findMany({
      where: { intentId: intent.id },
      select: { txSignature: true },
    });
    const knownSignatures = new Set(known.map((k) => k.txSignature));
    const fresh = payments.filter((p) => !knownSignatures.has(p.txSignature));
    if (fresh.length > 0) {
      for (const payment of fresh) {
        await this.recordPayment(intent.id, payment);
      }
      await this.intents.transition(intent.id, {
        type: 'DUPLICATE_PAYMENT_DETECTED',
      });
    }
    return this.tail();
  }

  private findPayments(intent: PaymentIntent): Promise<ChainPayment[]> {
    return this.adapter.findPaymentsByReference({
      reference: intent.reference,
      payoutAddress: intent.payoutAddress,
      token: intent.token as PayToken,
    });
  }

  /** Idempotent by txSignature — at-least-once job delivery must not duplicate rows. */
  private async recordPayment(
    intentId: string,
    payment: ChainPayment,
  ): Promise<void> {
    await this.prisma.onchainPayment.upsert({
      where: { txSignature: payment.txSignature },
      create: {
        intentId,
        txSignature: payment.txSignature,
        slot: payment.slot,
        amountToken: payment.amountTokenMinor,
        payerAddress: payment.payerAddress,
      },
      update: {},
    });
  }

  private firstRecordedPayment(
    intentId: string,
  ): Promise<OnchainPayment | null> {
    return this.prisma.onchainPayment.findFirst({
      where: { intentId },
      orderBy: { slot: 'asc' }, // chain order: the first payment is THE payment (FR-12)
    });
  }

  /** Both post-settlement tails (late payment, duplicates) share the 24h window. */
  private tailOver(intent: PaymentIntent): boolean {
    return (
      this.clock.now().getTime() >= intent.quoteExpiresAt.getTime() + this.tailMs
    );
  }

  private cadence(mode: WatchJobData['mode']): number {
    return mode === 'tail' ? this.tailPollMs : this.pollMs;
  }

  private active(): NextTick {
    return { mode: 'active', delayMs: this.pollMs };
  }

  private tail(): NextTick {
    return { mode: 'tail', delayMs: this.tailPollMs };
  }
}
