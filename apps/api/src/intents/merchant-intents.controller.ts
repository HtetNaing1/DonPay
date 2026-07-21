import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  IntentDetail,
  IntentSummary,
  ListIntentsQuery,
  listIntentsQuerySchema,
} from '@donpay/shared';
import { CurrentMerchant } from '../auth/current-merchant.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Merchant } from '../generated/prisma/client';
import { PaymentIntentService } from './payment-intent.service';

/** Dashboard surface (session auth) for the merchant's payments list + detail. */
@Controller('merchants/me/intents')
@UseGuards(SessionGuard)
export class MerchantIntentsController {
  constructor(private readonly intentService: PaymentIntentService) {}

  @Get()
  list(
    @CurrentMerchant() merchant: Merchant,
    @Query(new ZodValidationPipe(listIntentsQuerySchema))
    query: ListIntentsQuery,
  ): Promise<IntentSummary[]> {
    return this.intentService.listForMerchant(merchant.id, query);
  }

  @Get(':id')
  get(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') intentId: string,
  ): Promise<IntentDetail> {
    return this.intentService.getDetail(merchant.id, intentId);
  }
}
