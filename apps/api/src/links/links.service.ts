import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  CreatePaymentLinkInput,
  PaymentLinkView,
  PublicLink,
  UpdatePaymentLinkInput,
} from '@donpay/shared';
import { Clock, CLOCK } from '../common/clock';
import { IdempotencyService } from '../common/idempotency.service';
import { ERROR_CODES } from '../common/problem/error-codes';
import { ProblemException } from '../common/problem/problem.exception';
import { PaymentLink, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { effectiveLinkStatus } from './link-status';

/**
 * PaymentLink CRUD + slug generation + status logic. Links are configuration:
 * no rate is locked here (CLAUDE.md rule 6) — opening a link spawns an intent
 * with its own quote. Every query is merchantId-scoped (rule 4).
 */
@Injectable()
export class LinksService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * Create a link. With an Idempotency-Key (the `/v1` surface — rule 5) the
   * record is written in the same transaction as the link, so retries replay
   * instead of re-creating. The 64-bit random slug's unique constraint is
   * handled by retrying the whole transaction — a P2002 aborts a Postgres
   * transaction, so the re-mint must wrap it, not sit inside it.
   */
  async create(
    merchantId: string,
    input: CreatePaymentLinkInput,
    idempotencyKey?: string,
  ): Promise<PaymentLinkView> {
    if (idempotencyKey) {
      const stored = await this.idempotency.find(merchantId, idempotencyKey);
      if (stored) return stored as PaymentLinkView;
    }
    for (let attempt = 0; ; attempt++) {
      const slug = randomBytes(8).toString('base64url');
      try {
        return await this.prisma.$transaction(async (tx) => {
          const row = await tx.paymentLink.create({
            data: {
              merchantId,
              slug,
              type: input.type,
              amountMode: input.amountMode,
              fiatCurrency: input.fiatCurrency,
              amountFiat: input.amountFiat ?? null,
              minFiat: input.minFiat ?? null,
              maxFiat: input.maxFiat ?? null,
              token: input.token,
              note: input.note ?? null,
              expiresAt: input.expiresAt ?? null,
              // ONE_TIME is by definition single-use (PLAN.md)
              maxUses: input.type === 'ONE_TIME' ? 1 : (input.maxUses ?? null),
            },
          });
          const view = this.toView(row);
          if (idempotencyKey) {
            await this.idempotency.save(tx, merchantId, idempotencyKey, view);
          }
          return view;
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          // lost a same-key race: the winner's record is committed — replay it
          if (idempotencyKey) {
            const stored = await this.idempotency.find(
              merchantId,
              idempotencyKey,
            );
            if (stored) return stored as PaymentLinkView;
          }
          if (attempt < 2) continue; // slug collision — re-mint and retry
        }
        throw error;
      }
    }
  }

  async list(merchantId: string): Promise<PaymentLinkView[]> {
    const rows = await this.prisma.paymentLink.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toView(row));
  }

  async get(merchantId: string, linkId: string): Promise<PaymentLinkView> {
    const row = await this.prisma.paymentLink.findFirst({
      where: { id: linkId, merchantId },
    });
    if (!row) throw this.notFound();
    return this.toView(row);
  }

  /**
   * Pause/resume + edits to note/expiry/maxUses. Terminal links reject all
   * edits; an effectively-EXPIRED link (stored ACTIVE, date passed) may still
   * have its expiry extended — that is the legitimate way to revive one.
   */
  async update(
    merchantId: string,
    linkId: string,
    patch: UpdatePaymentLinkInput,
  ): Promise<PaymentLinkView> {
    const row = await this.prisma.paymentLink.findFirst({
      where: { id: linkId, merchantId },
    });
    if (!row) throw this.notFound();
    if (row.status === 'COMPLETED' || row.status === 'EXPIRED') {
      throw new ProblemException(
        409,
        ERROR_CODES.CONFLICT,
        `A ${row.status.toLowerCase()} link can no longer be changed`,
      );
    }

    const updated = await this.prisma.paymentLink.update({
      where: { id: row.id },
      data: {
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.note !== undefined && { note: patch.note }),
        ...(patch.expiresAt !== undefined && { expiresAt: patch.expiresAt }),
        ...(patch.maxUses !== undefined && { maxUses: patch.maxUses }),
      },
    });
    return this.toView(updated);
  }

  /**
   * Hard delete, allowed only while the link has no intents — after that it
   * is payment history and must be paused instead (reconciliation and the
   * merchant's books both need the link a payment came from). The intent
   * count is checked inside the transaction so a checkout opening
   * concurrently cannot slip in between check and delete.
   */
  async remove(merchantId: string, linkId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.paymentLink.findFirst({
        where: { id: linkId, merchantId },
      });
      if (!row) throw this.notFound();
      const intents = await tx.paymentIntent.count({
        where: { linkId: row.id },
      });
      if (intents > 0) {
        throw new ProblemException(
          409,
          ERROR_CODES.CONFLICT,
          'This link has payment history — pause it instead of deleting',
        );
      }
      await tx.paymentLink.delete({ where: { id: row.id } });
    });
  }

  /**
   * The public `/pay/[slug]` read — the one unscoped link lookup (a payer is
   * not a merchant; the slug is the capability). Returns only payable terms;
   * effective status included so the page can explain a closed link.
   */
  async getPublicBySlug(slug: string): Promise<PublicLink> {
    const row = await this.prisma.paymentLink.findUnique({
      where: { slug },
      include: { merchant: { select: { name: true } } },
    });
    if (!row) throw this.notFound();
    return {
      slug: row.slug,
      merchantName: row.merchant.name,
      amountMode: row.amountMode,
      fiatCurrency: row.fiatCurrency as PublicLink['fiatCurrency'],
      amountFiat: row.amountFiat,
      minFiat: row.minFiat,
      maxFiat: row.maxFiat,
      token: row.token,
      note: row.note,
      status: effectiveLinkStatus(row, this.clock.now()),
    };
  }

  private toView(row: PaymentLink): PaymentLinkView {
    return {
      id: row.id,
      slug: row.slug,
      type: row.type,
      amountMode: row.amountMode,
      // fiatCurrency is persisted as a validated string; the cast restores the union
      fiatCurrency: row.fiatCurrency as PaymentLinkView['fiatCurrency'],
      amountFiat: row.amountFiat,
      minFiat: row.minFiat,
      maxFiat: row.maxFiat,
      token: row.token,
      note: row.note,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      maxUses: row.maxUses,
      useCount: row.useCount,
      status: effectiveLinkStatus(row, this.clock.now()),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private notFound(): ProblemException {
    return new ProblemException(
      404,
      ERROR_CODES.NOT_FOUND,
      'Payment link not found',
    );
  }
}
