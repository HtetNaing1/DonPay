import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CreatePaymentIntentInput,
  createPaymentIntentSchema,
  PaymentIntentView,
} from '@donpay/shared';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentMerchant } from '../auth/current-merchant.decorator';
import { normalizeIdempotencyKey } from '../common/idempotency.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Merchant } from '../generated/prisma/client';
import { PaymentIntentService } from './payment-intent.service';

/** Developer API surface (`sk_` key auth) — PLAN.md FR-6. */
@Controller('v1/payment-intents')
@UseGuards(ApiKeyGuard)
export class IntentsController {
  constructor(private readonly intentService: PaymentIntentService) {}

  @Post()
  @HttpCode(201)
  create(
    @CurrentMerchant() merchant: Merchant,
    @Body(new ZodValidationPipe(createPaymentIntentSchema))
    body: CreatePaymentIntentInput,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PaymentIntentView> {
    return this.intentService.createFromApi(
      merchant.id,
      body,
      normalizeIdempotencyKey(idempotencyKey),
    );
  }

  @Get(':id')
  get(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') intentId: string,
  ): Promise<PaymentIntentView> {
    return this.intentService.get(merchant.id, intentId);
  }
}
