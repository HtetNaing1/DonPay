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
    const rows = await this.prisma.webhookEndpoint.findMany({
      where: { merchantId },
      orderBy: { id: 'asc' },
    });
    return rows.map(toView);
  }

  async create(
    merchantId: string,
    input: CreateWebhookEndpointInput,
  ): Promise<CreatedWebhookEndpoint> {
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
    // the only response that ever carries the secret
    return { ...toView(row), secret };
  }

  async update(
    merchantId: string,
    endpointId: string,
    patch: UpdateWebhookEndpointInput,
  ): Promise<WebhookEndpointView> {
    const updated = await this.prisma.webhookEndpoint.updateMany({
      where: { id: endpointId, merchantId },
      data: {
        ...(patch.url !== undefined && { url: patch.url }),
        ...(patch.events !== undefined && { events: patch.events }),
        ...(patch.active !== undefined && { active: patch.active }),
      },
    });
    if (updated.count === 0) throw this.notFound();
    const row = await this.prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, merchantId },
    });
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
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, merchantId },
      select: { id: true },
    });
    if (!endpoint) throw this.notFound();
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
    const row = await this.prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, endpoint: { merchantId } },
    });
    if (!row) throw this.notFound();
    if (row.status === 'PENDING') {
      throw new ProblemException(
        409,
        ERROR_CODES.CONFLICT,
        'This delivery is already queued',
      );
    }
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

function toView(row: WebhookEndpoint): WebhookEndpointView {
  return {
    id: row.id,
    url: row.url,
    events: row.events as WebhookEndpointView['events'],
    active: row.active,
  };
}

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
