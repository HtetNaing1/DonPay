import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  CreatedWebhookEndpoint,
  CreateWebhookEndpointInput,
  UpdateWebhookEndpointInput,
  WebhookDeliveryView,
  WebhookEndpointView,
} from '@donpay/shared';
import { Clock, CLOCK } from '../common/clock';
import { ERROR_CODES } from '../common/problem/error-codes';
import { ProblemException } from '../common/problem/problem.exception';
import {
  WebhookDelivery,
  WebhookEndpoint,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Merchant-facing webhook management. Secrets follow the API-key discipline
 * (rule 9's spirit): generated once, returned once, never listed again —
 * though stored in clear because the dispatcher must sign with them.
 * Every query is merchantId-scoped (rule 4); deliveries are reached only
 * through their endpoint's merchant.
 */
@Injectable()
export class WebhookEndpointsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(merchantId: string): Promise<WebhookEndpointView[]> {
    // Prisma's findMany with a `where` is a SELECT ... WHERE. Scoping by
    // merchantId is what makes cross-tenant reads structurally impossible: the
    // query can only ever see this merchant's rows (rule 4).
    const rows = await this.prisma.webhookEndpoint.findMany({
      where: { merchantId },
      orderBy: { id: 'asc' },
    });
    // Never return DB rows directly — the row has the `secret` column on it.
    // toView() maps to a safe shape that omits it (see the mapper at the bottom).
    return rows.map(toView);
  }

  async create(
    merchantId: string,
    input: CreateWebhookEndpointInput,
  ): Promise<CreatedWebhookEndpoint> {
    // Generate a high-entropy secret. randomBytes(24) = 24 cryptographically
    // random bytes; base64url makes it a URL-safe string; the `whsec_` prefix
    // makes leaked secrets greppable/identifiable (a common convention).
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    const row = await this.prisma.webhookEndpoint.create({
      data: {
        merchantId,
        url: input.url,
        events: input.events,
        active: input.active,
        secret,
      },
    });
    // The ONLY response that ever includes the secret. Everywhere else uses
    // toView() (no secret). Same discipline as API keys — shown once, then the
    // merchant is responsible for storing it (rule 9's spirit).
    return { ...toView(row), secret };
  }

  async update(
    merchantId: string,
    endpointId: string,
    patch: UpdateWebhookEndpointInput,
  ): Promise<WebhookEndpointView> {
    // Why updateMany (plural) for a single row? Because its `where` takes the
    // merchantId too. `update({ where: { id } })` would need a *unique* filter
    // and couldn't include merchantId — it would update by id alone, leaking
    // across tenants. updateMany filters on both, so a wrong-merchant id simply
    // matches zero rows. This is the merchant-scoping pattern (rule 4).
    const updated = await this.prisma.webhookEndpoint.updateMany({
      where: { id: endpointId, merchantId },
      // Spread-if-defined builds a partial update: only keys the caller actually
      // sent are written. `...(cond && { k: v })` adds `{ k: v }` when cond is
      // true, and `...false` / `...undefined` adds nothing. So an absent field
      // is left untouched rather than overwritten with undefined.
      data: {
        ...(patch.url !== undefined && { url: patch.url }),
        ...(patch.events !== undefined && { events: patch.events }),
        ...(patch.active !== undefined && { active: patch.active }),
      },
    });
    // count is how many rows matched. 0 means either no such id, or it belongs
    // to another merchant — both are indistinguishable to the caller, and both
    // are a 404 (we never reveal that someone else's endpoint exists).
    if (updated.count === 0) throw this.notFound();
    // Re-read to return the updated row (updateMany returns only a count).
    const row = await this.prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, merchantId },
    });
    // `row!` is a non-null assertion — we just confirmed it exists via count.
    return toView(row!);
  }

  async remove(merchantId: string, endpointId: string): Promise<void> {
    const deleted = await this.prisma.webhookEndpoint.deleteMany({
      where: { id: endpointId, merchantId },
    });
    if (deleted.count === 0) throw this.notFound();
  }

  /** Latest deliveries for one endpoint — the dashboard delivery log. */
  async deliveries(
    merchantId: string,
    endpointId: string,
  ): Promise<WebhookDeliveryView[]> {
    // Two-step scoping: deliveries don't carry merchantId, they belong to an
    // endpoint. So first prove this merchant owns the endpoint (findFirst with
    // both ids; `select` fetches only `id` since we just need existence)...
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, merchantId },
      select: { id: true },
    });
    if (!endpoint) throw this.notFound();
    // ...then it's safe to query deliveries by endpointId alone.
    // orderBy createdAt desc = newest first; take: 50 caps the page size so a
    // busy endpoint's log can't return unbounded rows.
    const rows = await this.prisma.webhookDelivery.findMany({
      where: { endpointId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map(toDeliveryView);
  }

  /**
   * Manual redeliver: mark the row due now; the dispatcher makes one fresh
   * attempt on its next sweep (a DEAD row that fails again goes straight
   * back to DEAD — redelivery is one more try, not a new retry cycle).
   */
  async redeliver(
    merchantId: string,
    deliveryId: string,
  ): Promise<WebhookDeliveryView> {
    // Scope through the relation: `endpoint: { merchantId }` filters deliveries
    // whose parent endpoint belongs to this merchant — a Prisma relation filter,
    // i.e. a JOIN. Same rule-4 guarantee without a separate ownership query.
    const row = await this.prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, endpoint: { merchantId } },
    });
    if (!row) throw this.notFound();
    // Guard: a PENDING row is already going to be attempted by the dispatcher,
    // so re-queuing it is a no-op and we reject it as a conflict (409) rather
    // than silently doing nothing.
    if (row.status === 'PENDING') {
      throw new ProblemException(
        409,
        ERROR_CODES.CONFLICT,
        'This delivery is already queued',
      );
    }
    // The whole redeliver: set status back to PENDING and mark it due now.
    // We do NOT reset the attempts counter — a DEAD row that fails again stays
    // DEAD (see the dispatcher). Redelivery is "one more try", not a fresh cycle.
    const updated = await this.prisma.webhookDelivery.update({
      where: { id: row.id },
      data: { status: 'PENDING', nextAttemptAt: this.clock.now() },
    });
    return toDeliveryView(updated);
  }

  private notFound(): ProblemException {
    return new ProblemException(
      404,
      ERROR_CODES.NOT_FOUND,
      'Webhook endpoint not found',
    );
  }
}

// Mappers: DB row -> API shape. This boundary matters. The row type includes
// `secret`; the view type deliberately does not, so it is impossible to leak
// the secret by forgetting — the returned object simply has no such field.
function toView(row: WebhookEndpoint): WebhookEndpointView {
  return {
    id: row.id,
    url: row.url,
    // `events` is stored as a Postgres string[] the DB types loosely; the
    // `as` restores the precise WebhookEvent[] union the API contract promises.
    events: row.events as WebhookEndpointView['events'],
    active: row.active,
  };
}

// Deliveries carry Date objects from the DB; the API serializes times as ISO
// strings, so the mapper does that conversion (and `?? null` for optionals).
function toDeliveryView(row: WebhookDelivery): WebhookDeliveryView {
  return {
    id: row.id,
    intentId: row.intentId,
    event: row.event as WebhookDeliveryView['event'],
    status: row.status,
    attempts: row.attempts,
    lastResponseCode: row.lastResponseCode,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
