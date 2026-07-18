import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CreatePaymentLinkInput,
  createPaymentLinkSchema,
  PaymentLinkView,
  UpdatePaymentLinkInput,
  updatePaymentLinkSchema,
} from '@donpay/shared';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentMerchant } from '../auth/current-merchant.decorator';
import { normalizeIdempotencyKey } from '../common/idempotency.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Merchant } from '../generated/prisma/client';
import { LinksService } from './links.service';

/**
 * Developer API surface (`sk_` key auth) — same LinksService as the
 * dashboard, no divergence (rule 12: the web app is just another client).
 * Idempotency-Key applies to POST (rule 5); PATCH and DELETE are naturally
 * idempotent.
 */
@Controller('v1/payment-links')
@UseGuards(ApiKeyGuard)
export class LinksApiController {
  constructor(private readonly linksService: LinksService) {}

  @Get()
  list(@CurrentMerchant() merchant: Merchant): Promise<PaymentLinkView[]> {
    return this.linksService.list(merchant.id);
  }

  @Get(':id')
  get(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') linkId: string,
  ): Promise<PaymentLinkView> {
    return this.linksService.get(merchant.id, linkId);
  }

  @Post()
  @HttpCode(201)
  create(
    @CurrentMerchant() merchant: Merchant,
    @Body(new ZodValidationPipe(createPaymentLinkSchema))
    body: CreatePaymentLinkInput,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PaymentLinkView> {
    return this.linksService.create(
      merchant.id,
      body,
      normalizeIdempotencyKey(idempotencyKey),
    );
  }

  @Patch(':id')
  update(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') linkId: string,
    @Body(new ZodValidationPipe(updatePaymentLinkSchema))
    body: UpdatePaymentLinkInput,
  ): Promise<PaymentLinkView> {
    return this.linksService.update(merchant.id, linkId, body);
  }

  /** Only unused links can be deleted; with intents this 409s (pause instead). */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') linkId: string,
  ): Promise<void> {
    return this.linksService.remove(merchant.id, linkId);
  }
}
