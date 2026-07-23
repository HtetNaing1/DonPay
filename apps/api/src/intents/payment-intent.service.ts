import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CheckoutIntent,
  CreatePaymentIntentInput,
  FiatCurrency,
  fiatMinorToMajor,
  IntentDetail,
  IntentSummary,
  ListIntentsQuery,
  OpenLinkIntentInput,
  PaymentIntentView,
  PayToken,
  WebhookEvent,
} from '@donpay/shared';
import { CHAIN_ADAPTER, ChainAdapter } from '../chain/chain-adapter';
import {
  REFERENCE_GENERATOR,
  ReferenceGenerator,
} from '../chain/reference-generator';
import { Clock, CLOCK } from '../common/clock';
import { IdempotencyService } from '../common/idempotency.service';
import { ERROR_CODES } from '../common/problem/error-codes';
import { ProblemException } from '../common/problem/problem.exception';
import { Env } from '../config/env';
import {
  IntentStatus,
  PaymentIntent,
  PaymentLink,
  Prisma,
} from '../generated/prisma/client';
import { effectiveLinkStatus } from '../links/link-status';
import { PrismaService } from '../prisma/prisma.service';
import { IntentEventsService } from '../queues/intent-events.service';
import { WatchQueueService } from '../queues/watch-queue.service';
import { QuoteService } from '../rates/quote.service';
import { WebhookOutboxService } from '../webhooks/webhook-outbox.service';
import {
  decideTransition,
  IntentEvent,
  TransitionConflictError,
} from './state-machine';

interface MintParams {
  merchantId: string;
  linkId: string | null;
  fiatCurrency: FiatCurrency;
  amountFiat: number;
  token: PayToken;
  note: string | null;
  idempotencyKey?: string;
}

/**
 * Intent status → the webhook event a transition into it emits. Explicit and
 * exhaustive (the compiler rejects an unmapped status), so a new state can
 * never silently ship an off-contract event name. CREATED is the initial
 * status — no transition targets it — so it maps to null (emits nothing).
 */
const STATUS_WEBHOOK_EVENT: Record<IntentStatus, WebhookEvent | null> = {
  CREATED: null,
  PENDING: 'intent.pending',
  DETECTED: 'intent.detected',
  CONFIRMED: 'intent.confirmed',
  FINALIZED: 'intent.finalized',
  EXPIRED: 'intent.expired',
  UNDERPAID: 'intent.underpaid',
  LATE_PAYMENT: 'intent.late_payment',
};

/**
 * PaymentIntent lifecycle: creation (both doors: API and link-open) and
 * `transition()` — the sole status writer (rule 2). Every merchant-facing
 * read is merchantId-scoped (rule 4).
 */
@Injectable()
export class PaymentIntentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quoteService: QuoteService,
    private readonly idempotency: IdempotencyService,
    @Inject(REFERENCE_GENERATOR)
    private readonly referenceGenerator: ReferenceGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly config: ConfigService<Env, true>,
    private readonly watchQueue: WatchQueueService,
    @Inject(CHAIN_ADAPTER) private readonly chainAdapter: ChainAdapter,
    private readonly intentEvents: IntentEventsService,
    private readonly webhookOutbox: WebhookOutboxService,
  ) {}

  /** `POST /v1/payment-intents` — same key + same merchant replays, never re-executes (rule 5). */
  async createFromApi(
    merchantId: string,
    input: CreatePaymentIntentInput,
    idempotencyKey?: string,
  ): Promise<PaymentIntentView> {
    // Short-circuit a replay before pricing, so a retry never hits the rate
    // source or starts a second watch. The lost-race path (both requests miss
    // here, then collide on insert) is handled by mint → idempotency.runOnce.
    if (idempotencyKey) {
      const stored = await this.idempotency.find(merchantId, idempotencyKey);
      if (stored) return stored as PaymentIntentView;
    }
    return this.mint({
      merchantId,
      linkId: null,
      fiatCurrency: input.fiatCurrency,
      amountFiat: input.amountFiat,
      token: input.token,
      note: input.note ?? null,
      idempotencyKey,
    });
  }

  /**
   * Public link-open flow (`/pay/[slug]`). Opening a link does NOT consume a
   * use: useCount counts finalized payments (incremented by transition() on
   * PAYMENT_FINALIZED), so an abandoned checkout can never exhaust a link —
   * and FR-12 requires that concurrent payers of a one-time link each get an
   * intent.
   */
  async openLink(
    slug: string,
    input: OpenLinkIntentInput,
  ): Promise<PaymentIntentView> {
    const link = await this.prisma.paymentLink.findUnique({ where: { slug } });
    if (!link) {
      throw new ProblemException(
        404,
        ERROR_CODES.NOT_FOUND,
        'Payment link not found',
      );
    }
    const status = effectiveLinkStatus(link, this.clock.now());
    if (status !== 'ACTIVE') {
      throw new ProblemException(
        409,
        ERROR_CODES.LINK_NOT_PAYABLE,
        `This link is ${status.toLowerCase()} and no longer accepts payments`,
      );
    }
    return this.mint({
      merchantId: link.merchantId,
      linkId: link.id,
      fiatCurrency: link.fiatCurrency as FiatCurrency,
      amountFiat: this.resolveLinkAmount(link, input),
      token: link.token,
      // snapshot: the payments list keeps its context even if the link is edited
      note: link.note,
    });
  }

  async get(merchantId: string, intentId: string): Promise<PaymentIntentView> {
    const row = await this.prisma.paymentIntent.findFirst({
      where: { id: intentId, merchantId },
    });
    if (!row) {
      throw new ProblemException(
        404,
        ERROR_CODES.NOT_FOUND,
        'Payment intent not found',
      );
    }
    return this.toView(row);
  }

  /**
   * The dashboard payments list — merchant-scoped (rule 4), newest first,
   * optionally narrowed by state and/or originating link. Session auth.
   */
  async listForMerchant(
    merchantId: string,
    filter: ListIntentsQuery,
  ): Promise<IntentSummary[]> {
    const rows = await this.prisma.paymentIntent.findMany({
      where: {
        merchantId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.linkId ? { linkId: filter.linkId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { link: { select: { slug: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      status: row.status,
      flags: row.flags as IntentSummary['flags'],
      fiatCurrency: row.fiatCurrency as FiatCurrency,
      amountFiat: row.amountFiat,
      token: row.token,
      amountToken: row.amountToken.toString(),
      linkId: row.linkId,
      linkSlug: row.link?.slug ?? null,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * One intent for the dashboard detail page: the ticket plus its full audit
   * timeline and any on-chain payments. Merchant-scoped (rule 4).
   */
  async getDetail(merchantId: string, intentId: string): Promise<IntentDetail> {
    const row = await this.prisma.paymentIntent.findFirst({
      where: { id: intentId, merchantId },
      include: {
        link: { select: { slug: true } },
        transitions: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { slot: 'asc' } },
      },
    });
    if (!row) {
      throw new ProblemException(
        404,
        ERROR_CODES.NOT_FOUND,
        'Payment intent not found',
      );
    }
    return {
      ...this.toView(row),
      linkSlug: row.link?.slug ?? null,
      transitions: row.transitions.map((t) => ({
        fromStatus: t.fromStatus,
        toStatus: t.toStatus,
        event: t.event,
        at: t.createdAt.toISOString(),
      })),
      payments: row.payments.map((p) => ({
        txSignature: p.txSignature,
        amountToken: p.amountToken.toString(),
        payerAddress: p.payerAddress,
        slot: p.slot.toString(),
        detectedAt: p.detectedAt.toISOString(),
        finalizedAt: p.finalizedAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * The only writer of intent status and flags (rule 2): pure decision
   * (`decideTransition`) + transactional application under
   * `SELECT ... FOR UPDATE`, with an IntentTransition audit row in the same
   * transaction. Concurrent conflicting events serialize on the row lock;
   * the loser re-reads a changed status, gets a TransitionConflictError, and
   * nothing it did survives. Internal-only — controllers never call this;
   * the watcher and expiry jobs do (not merchant-initiated, hence no
   * merchantId). Outbox WebhookDelivery rows and the WS push join this
   * transaction with their week-3 tasks (rule 3).
   */
  async transition(
    intentId: string,
    event: IntentEvent,
  ): Promise<PaymentIntentView> {
    const view = await this.prisma.$transaction(async (tx) => {
      // Raw SQL takes the lock only; data reads stay on the typed client
      // (the pg adapter returns raw array columns as strings, not arrays).
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "PaymentIntent" WHERE id = ${intentId} FOR UPDATE`;
      if (locked.length === 0) {
        throw new ProblemException(
          404,
          ERROR_CODES.NOT_FOUND,
          'Payment intent not found',
        );
      }
      const current = await tx.paymentIntent.findUniqueOrThrow({
        where: { id: intentId },
        select: { status: true, flags: true, linkId: true, merchantId: true },
      });

      const decision = decideTransition(current.status, event);
      if (!decision.ok) {
        throw new TransitionConflictError(
          current.status,
          event.type,
          decision.reason,
        );
      }

      const flags = new Set([...current.flags, ...decision.addFlags]);
      if (event.type === 'PAYMENT_FINALIZED' && current.linkId !== null) {
        // Finalization consumes a link use (FR-12) — see consumeLinkUse.
        if (await this.consumeLinkUse(tx, current.linkId)) {
          flags.add('DUPLICATE_PAYMENT');
        }
      }

      const row = await tx.paymentIntent.update({
        where: { id: intentId },
        data: { status: decision.to, flags: [...flags] },
      });
      await tx.intentTransition.create({
        data: {
          intentId,
          fromStatus: current.status,
          toStatus: decision.to,
          event: event.type,
        },
      });
      const transitioned = this.toView(row);
      // Outbox rows share this transaction (rule 3): a webhook can never
      // fire for a transition that didn't commit, or be lost by one that did.
      const webhookEvent = this.webhookEventFor(event, decision.to);
      if (webhookEvent) {
        await this.webhookOutbox.enqueue(tx, {
          merchantId: current.merchantId,
          intentId,
          event: webhookEvent,
          intent: transitioned,
        });
      }
      return transitioned;
    });

    // Post-commit fan-out to live checkout pages (WS gateway subscribes).
    // Fire-and-forget: the page's fallback poll heals a missed push.
    await this.intentEvents.publish({ intentId });
    return view;
  }

  /**
   * Everything the public checkout page renders, addressed by unguessable
   * intent id — the one deliberately unscoped read (a customer is not a
   * merchant). Exposes only what the payer already knows or needs: no
   * merchant ids, keys, or other intents.
   */
  async getPublicCheckout(intentId: string): Promise<CheckoutIntent> {
    const row = await this.prisma.paymentIntent.findUnique({
      where: { id: intentId },
      include: {
        merchant: { select: { name: true } },
        link: { select: { slug: true } },
        transitions: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { slot: 'asc' } },
      },
    });
    if (!row) {
      throw new ProblemException(
        404,
        ERROR_CODES.NOT_FOUND,
        'Payment intent not found',
      );
    }
    return {
      id: row.id,
      status: row.status,
      flags: row.flags as CheckoutIntent['flags'],
      merchantName: row.merchant.name,
      fiatCurrency: row.fiatCurrency as FiatCurrency,
      amountFiat: row.amountFiat,
      token: row.token,
      amountToken: row.amountToken.toString(),
      // label/message show up in the payer's wallet UI
      paymentUrl: this.chainAdapter.buildPaymentUrl({
        payoutAddress: row.payoutAddress,
        token: row.token,
        amountTokenMinor: row.amountToken,
        reference: row.reference,
        label: row.merchant.name,
        message: row.note ?? undefined,
      }),
      payoutAddress: row.payoutAddress,
      reference: row.reference,
      note: row.note,
      linkSlug: row.link?.slug ?? null,
      quoteExpiresAt: row.quoteExpiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      transitions: row.transitions.map((t) => ({
        status: t.toStatus,
        at: t.createdAt.toISOString(),
      })),
      payments: row.payments.map((p) => ({
        txSignature: p.txSignature,
        amountToken: p.amountToken.toString(),
      })),
    };
  }

  private resolveLinkAmount(
    link: PaymentLink,
    input: OpenLinkIntentInput,
  ): number {
    if (link.amountMode === 'FIXED') {
      if (input.amountFiat !== undefined) {
        throw this.badAmount('This link has a fixed amount');
      }
      if (link.amountFiat === null) {
        throw new Error(`FIXED link ${link.id} has no amountFiat`);
      }
      return link.amountFiat;
    }
    if (input.amountFiat === undefined) {
      throw this.badAmount('amountFiat is required for this link');
    }
    // details are payer-facing (the checkout form shows them) — major units
    const currency = link.fiatCurrency as FiatCurrency;
    if (link.minFiat !== null && input.amountFiat < link.minFiat) {
      throw this.badAmount(
        `The minimum for this link is ${fiatMinorToMajor(link.minFiat, currency)} ${currency}`,
      );
    }
    if (link.maxFiat !== null && input.amountFiat > link.maxFiat) {
      throw this.badAmount(
        `The maximum for this link is ${fiatMinorToMajor(link.maxFiat, currency)} ${currency}`,
      );
    }
    return input.amountFiat;
  }

  private async mint(params: MintParams): Promise<PaymentIntentView> {
    // Fail fast before pricing: an intent is unpayable without a destination
    const payoutWallet = await this.prisma.walletAddress.findFirst({
      where: {
        merchantId: params.merchantId,
        isDefault: true,
        verifiedAt: { not: null },
      },
    });
    if (!payoutWallet) {
      throw new ProblemException(
        409,
        ERROR_CODES.PAYOUT_WALLET_MISSING,
        'Verify a payout wallet before accepting payments',
      );
    }

    // Rate locks here, at intent creation — never at link creation (rule 6).
    // Fetched before the transaction so no HTTP call runs inside it.
    const quote = await this.quoteService.createQuote({
      fiatCurrency: params.fiatCurrency,
      amountFiatMinor: params.amountFiat,
      token: params.token,
    });

    // runOnce persists the idempotency record in the same transaction as the
    // intent (rule 5) and replays a stored response on a lost same-key race.
    const { value, replayed } = await this.idempotency.runOnce(
      params.merchantId,
      params.idempotencyKey,
      async (tx) => {
        const row = await tx.paymentIntent.create({
          data: {
            merchantId: params.merchantId,
            linkId: params.linkId,
            reference: this.referenceGenerator.generateReference(),
            fiatCurrency: quote.fiatCurrency,
            amountFiat: quote.amountFiatMinor,
            token: quote.token,
            amountToken: quote.amountTokenMinor,
            rateLocked: quote.rate,
            rateSource: quote.rateSource,
            quoteExpiresAt: quote.lockedUntil,
            payoutAddress: payoutWallet.address,
            note: params.note,
            idempotencyKey: params.idempotencyKey ?? null,
          },
        });
        return this.toView(row);
      },
    );

    // Watch starts only after the intent is committed, and only for a freshly
    // created intent — a replayed response is already being watched. If Redis
    // is down we fail loudly; an unwatched intent would accept a payment
    // nobody detects.
    if (!replayed) await this.watchQueue.startWatch(value.id);
    return value;
  }

  private toView(row: PaymentIntent): PaymentIntentView {
    return {
      id: row.id,
      linkId: row.linkId,
      reference: row.reference,
      // persisted as validated strings; the casts restore the unions
      fiatCurrency: row.fiatCurrency as FiatCurrency,
      amountFiat: row.amountFiat,
      token: row.token,
      amountToken: row.amountToken.toString(),
      rate: row.rateLocked.toString(),
      rateSource: row.rateSource,
      quoteExpiresAt: row.quoteExpiresAt.toISOString(),
      payoutAddress: row.payoutAddress,
      status: row.status,
      flags: row.flags as PaymentIntentView['flags'],
      note: row.note,
      checkoutUrl: `${this.config.get('WEB_BASE_URL', { infer: true })}/checkout/${row.id}`,
      paymentUrl: this.chainAdapter.buildPaymentUrl({
        payoutAddress: row.payoutAddress,
        token: row.token,
        amountTokenMinor: row.amountToken,
        reference: row.reference,
      }),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private badAmount(detail: string): ProblemException {
    return new ProblemException(400, ERROR_CODES.VALIDATION_FAILED, detail);
  }

  /**
   * Finalization consumes a link use, in the same transaction as the status
   * write — this is what completes one-time links (their effective status
   * derives from useCount). The atomic increment decides the FR-12 race:
   * whichever intent pushes useCount past maxUses lost, and its payment is
   * flagged — funds still moved on-chain, so it finalizes; it is surfaced,
   * never swallowed. Returns true when this use exceeded maxUses (the caller
   * flags the intent DUPLICATE_PAYMENT).
   */
  private async consumeLinkUse(
    tx: Prisma.TransactionClient,
    linkId: string,
  ): Promise<boolean> {
    const link = await tx.paymentLink.update({
      where: { id: linkId },
      data: { useCount: { increment: 1 } },
    });
    return link.maxUses !== null && link.useCount > link.maxUses;
  }

  /**
   * Which webhook event a transition emits (rule 3). Named after the target
   * status via the exhaustive STATUS_WEBHOOK_EVENT map, except
   * DUPLICATE_PAYMENT_DETECTED: it lands on an already-FINALIZED intent but
   * must announce the duplicate, not re-announce finalization. null means
   * "no event for this transition" (only CREATED, which is never a target).
   */
  private webhookEventFor(
    event: IntentEvent,
    to: IntentStatus,
  ): WebhookEvent | null {
    if (event.type === 'DUPLICATE_PAYMENT_DETECTED') {
      return 'intent.duplicate_payment';
    }
    return STATUS_WEBHOOK_EVENT[to];
  }
}
