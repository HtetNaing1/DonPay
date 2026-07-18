import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CreatedWebhookEndpoint,
  CreateWebhookEndpointInput,
  createWebhookEndpointSchema,
  UpdateWebhookEndpointInput,
  updateWebhookEndpointSchema,
  WebhookDeliveryView,
  WebhookEndpointView,
} from '@donpay/shared';
import { CurrentMerchant } from '../auth/current-merchant.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Merchant } from '../generated/prisma/client';
import { WebhookEndpointsService } from './webhook-endpoints.service';

/** Dashboard surface (session auth) for webhook endpoints + delivery log. */
@Controller('merchants/me/webhooks')
@UseGuards(SessionGuard)
export class WebhooksController {
  constructor(private readonly endpoints: WebhookEndpointsService) {}

  @Get()
  list(@CurrentMerchant() merchant: Merchant): Promise<WebhookEndpointView[]> {
    return this.endpoints.list(merchant.id);
  }

  /** The response carries the signing secret — the only time it is shown. */
  @Post()
  @HttpCode(201)
  create(
    @CurrentMerchant() merchant: Merchant,
    @Body(new ZodValidationPipe(createWebhookEndpointSchema))
    body: CreateWebhookEndpointInput,
  ): Promise<CreatedWebhookEndpoint> {
    return this.endpoints.create(merchant.id, body);
  }

  @Patch(':id')
  update(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') endpointId: string,
    @Body(new ZodValidationPipe(updateWebhookEndpointSchema))
    body: UpdateWebhookEndpointInput,
  ): Promise<WebhookEndpointView> {
    return this.endpoints.update(merchant.id, endpointId, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') endpointId: string,
  ): Promise<void> {
    return this.endpoints.remove(merchant.id, endpointId);
  }

  @Get(':id/deliveries')
  deliveries(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') endpointId: string,
  ): Promise<WebhookDeliveryView[]> {
    return this.endpoints.deliveries(merchant.id, endpointId);
  }

  /** One fresh attempt on the next dispatcher sweep. */
  @Post('deliveries/:deliveryId/redeliver')
  @HttpCode(200)
  redeliver(
    @CurrentMerchant() merchant: Merchant,
    @Param('deliveryId') deliveryId: string,
  ): Promise<WebhookDeliveryView> {
    return this.endpoints.redeliver(merchant.id, deliveryId);
  }
}
